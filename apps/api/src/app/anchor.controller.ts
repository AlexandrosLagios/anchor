import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorService, Role } from './anchor.service';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard';
import { ChatService } from './chat.service';
import { download, sendWhatsApp, twiml, validTwilioRequest } from './twilio';
import { UserStoreService } from './user-store.service';

type TwilioForm = Record<string, string | undefined>;

type MomentBody = {
  text?: string;
  from?: Role;
  /** Optional data URL or raw base64 with mimeType for a photo or voice note */
  mediaBase64?: string;
  mediaMimeType?: string;
};

@Controller()
export class RootController {
  private readonly logger = new Logger(RootController.name);

  constructor(private readonly anchor: AnchorService) {}

  @Get()
  health() {
    return {
      ok: true,
      service: 'anchor-api',
      aiProvider: 'openai',
      aiDataRegionNote: process.env.OPENAI_DATA_REGION_NOTE ?? 'openai-api-global',
      requireAuth: process.env.REQUIRE_AUTH === 'true' || process.env.REQUIRE_AUTH === '1',
    };
  }

  @Post('whatsapp')
  @HttpCode(200)
  @Header('content-type', 'text/xml')
  whatsapp(@Req() req: Request, @Body() body: TwilioForm) {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') params[key] = value;
    }
    const url = `${(process.env.PUBLIC_URL ?? '').replace(/\/$/, '')}/whatsapp`;
    if (!validTwilioRequest(url, params, req.header('x-twilio-signature') ?? undefined)) {
      throw new ForbiddenException('Invalid Twilio signature');
    }

    const from = body.From ?? '';
    const isAudio = body.MediaContentType0?.startsWith('audio/');
    const isImage = body.MediaContentType0?.startsWith('image/');
    const text = (body.Body ?? '').trim();
    const owner = AnchorService.whatsappOwner();

    (async () => {
      await this.anchor.ensure(owner);
      const state = this.anchor.state(owner);
      const waiting = state.moments.some((moment) => moment.phase === 'awaiting' || moment.phase === 'hinted');

      if (waiting) {
        const audio =
          isAudio && body.MediaUrl0
            ? { data: await download(body.MediaUrl0), mimeType: body.MediaContentType0 ?? '' }
            : undefined;
        await this.anchor.replyAsAthina(owner, { text: text || undefined, audio });
        return;
      }

      const media =
        body.MediaUrl0 && (isAudio || isImage)
          ? { data: await download(body.MediaUrl0), mimeType: body.MediaContentType0 ?? '' }
          : undefined;
      const ack = await this.anchor.addMoment(
        owner,
        {
          text: text || undefined,
          audio: isAudio ? media : undefined,
          image: isImage ? media : undefined,
        },
        from,
      );
      await sendWhatsApp(from, ack);
    })().catch((error) => this.logger.error(error));

    return twiml();
  }
}
@Controller('api')
@UseGuards(AuthGuard)
export class AnchorController {
  constructor(
    private readonly anchor: AnchorService,
    private readonly userStore: UserStoreService,
    private readonly chatService: ChatService,
  ) {}

  @Get('state')
  async state(@CurrentUser() user: AuthUser | null) {
    const owner = AnchorService.ownerFor(user?.uid);
    await this.anchor.ensure(owner);
    return this.anchor.state(owner);
  }

  @Post('moment')
  async moment(@Body() body: MomentBody, @CurrentUser() user: AuthUser | null) {
    const owner = AnchorService.ownerFor(user?.uid);
    const media = decodeMedia(body.mediaBase64, body.mediaMimeType);
    const ack = await this.anchor.addMoment(owner, {
      text: body.text,
      from: body.from,
      image: media?.mimeType.startsWith('image/') ? media : undefined,
      audio: media?.mimeType.startsWith('audio/') ? media : undefined,
    });
    await this.persist(owner);
    return { ack };
  }

  @Post('bring-back')
  async bringBack(@Body() body: { momentId?: string } = {}, @CurrentUser() user: AuthUser | null) {
    const owner = AnchorService.ownerFor(user?.uid);
    const result = await this.anchor.bringBack(owner, body.momentId);
    if (!result.ok) throw new BadRequestException(result.reason);
    await this.persist(owner);
    return result;
  }

  @Post('chat')
  async chat(@Body() body: { messages?: unknown }, @CurrentUser() user: AuthUser | null) {
    if (!user) throw new UnauthorizedException('Sign in required');
    return this.chatService.reply(user.uid, body.messages);
  }

  @Post('reply')
  async reply(
    @Body() body: { text?: string; mediaBase64?: string; mediaMimeType?: string },
    @CurrentUser() user: AuthUser | null,
  ) {
    const owner = AnchorService.ownerFor(user?.uid);
    const media = decodeMedia(body.mediaBase64, body.mediaMimeType);
    const result = await this.anchor.replyAsAthina(owner, {
      text: body.text,
      audio: media?.mimeType.startsWith('audio/') ? media : undefined,
    });
    if (!result.ok) throw new BadRequestException(result.reason);
    await this.persist(owner);
    return result;
  }

  @Get('audio/:file')
  audio(@Param('file') file: string) {
    return this.file(file);
  }

  @Get('media/:file')
  media(@Param('file') file: string) {
    return this.file(file);
  }

  @Get('demo.html')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="anchor-demo.html"')
  async demo(@CurrentUser() user: AuthUser | null) {
    const owner = AnchorService.ownerFor(user?.uid);
    await this.anchor.ensure(owner);
    const page = readFileSync(join(__dirname, 'assets', 'index.html'), 'utf8');
    const demo = JSON.stringify(this.anchor.demo(owner)).replace(/</g, '\\u003c');
    return page.replace('<script>', () => `<script>window.DEMO = ${demo};</script>\n<script>`);
  }

  private async persist(owner: string) {
    if (owner === 'demo' || owner === 'whatsapp') return;
    const state = this.anchor.state(owner);
    await this.userStore.persistSnapshot(owner, {
      chat: state.chat,
      moments: state.moments,
      activeId: state.activeId,
    });
  }

  private file(file: string) {
    const clip = this.anchor.audioFile(file.replace(/\.(wav|bin)$/, ''));
    if (!clip) throw new NotFoundException();
    return new StreamableFile(clip.data, { type: clip.mimeType });
  }
}

function decodeMedia(base64?: string, mimeType?: string): { data: Buffer; mimeType: string } | undefined {
  if (!base64) return undefined;
  const dataUrl = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrl) return { data: Buffer.from(dataUrl[2], 'base64'), mimeType: dataUrl[1] };
  if (!mimeType) throw new BadRequestException('mediaMimeType required with mediaBase64');
  return { data: Buffer.from(base64, 'base64'), mimeType };
}
