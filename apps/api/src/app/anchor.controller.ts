import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorService, Role } from './anchor.service';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.guard';
import { download, sendWhatsApp, twiml } from './twilio';
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
      geminiDataRegionNote: process.env.GEMINI_DATA_REGION_NOTE ?? 'developer-api-global',
      requireAuth: process.env.REQUIRE_AUTH === 'true' || process.env.REQUIRE_AUTH === '1',
    };
  }

  @Post('whatsapp')
  @HttpCode(200)
  @Header('content-type', 'text/xml')
  whatsapp(@Body() body: TwilioForm) {
    const from = body.From ?? '';
    const isAudio = body.MediaContentType0?.startsWith('audio/');
    const isImage = body.MediaContentType0?.startsWith('image/');
    const text = (body.Body ?? '').trim();

    (async () => {
      const state = this.anchor.state();
      const waiting = state.moments.some((moment) => moment.phase === 'awaiting' || moment.phase === 'hinted');

      if (waiting) {
        const audio =
          isAudio && body.MediaUrl0
            ? { data: await download(body.MediaUrl0), mimeType: body.MediaContentType0 ?? '' }
            : undefined;
        await this.anchor.replyAsAthina({ text: text || undefined, audio });
        return;
      }

      const media =
        body.MediaUrl0 && (isAudio || isImage)
          ? { data: await download(body.MediaUrl0), mimeType: body.MediaContentType0 ?? '' }
          : undefined;
      const ack = await this.anchor.addMoment(
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

// ponytail: no X-Twilio-Signature check yet — add before real family data flows through here
@Controller('api')
@UseGuards(AuthGuard)
export class AnchorController {
  constructor(
    private readonly anchor: AnchorService,
    private readonly userStore: UserStoreService,
  ) {}

  @Get('state')
  state() {
    return this.anchor.state();
  }

  @Post('moment')
  async moment(@Body() body: MomentBody, @CurrentUser() user: AuthUser | null) {
    const media = decodeMedia(body.mediaBase64, body.mediaMimeType);
    const ack = await this.anchor.addMoment({
      text: body.text,
      from: body.from,
      image: media?.mimeType.startsWith('image/') ? media : undefined,
      audio: media?.mimeType.startsWith('audio/') ? media : undefined,
    });
    await this.persist(user);
    return { ack };
  }

  /** Alias kept for the old rehearse script and muscle memory */
  @Post('news')
  async news(@Body() body: { text: string; from?: Role }, @CurrentUser() user: AuthUser | null) {
    const ack = await this.anchor.addMoment({ text: body.text, from: body.from });
    await this.persist(user);
    return { ack };
  }

  @Post('bring-back')
  async bringBack(@Body() body: { momentId?: string } = {}, @CurrentUser() user: AuthUser | null) {
    const result = await this.anchor.bringBack(body.momentId);
    if (!result.ok) throw new BadRequestException(result.reason);
    await this.persist(user);
    return result;
  }

  @Post('reply')
  async reply(
    @Body() body: { text?: string; mediaBase64?: string; mediaMimeType?: string },
    @CurrentUser() user: AuthUser | null,
  ) {
    const media = decodeMedia(body.mediaBase64, body.mediaMimeType);
    const result = await this.anchor.replyAsAthina({
      text: body.text,
      audio: media?.mimeType.startsWith('audio/') ? media : undefined,
    });
    if (!result.ok) throw new BadRequestException(result.reason);
    await this.persist(user);
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
  demo() {
    const page = readFileSync(join(__dirname, 'assets', 'index.html'), 'utf8');
    const demo = JSON.stringify(this.anchor.demo()).replace(/</g, '\\u003c');
    return page.replace('<script>', () => `<script>window.DEMO = ${demo};</script>\n<script>`);
  }

  private async persist(user: AuthUser | null) {
    if (!user) return;
    const state = this.anchor.state();
    await this.userStore.persistSnapshot(user.uid, {
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
