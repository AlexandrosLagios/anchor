import { BadGatewayException, Body, Controller, Get, Header, Headers, HttpCode, Logger, NotFoundException, Param, Post, StreamableFile } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnchorService } from './anchor.service';
import { download, sendWhatsApp, twiml } from './twilio';

type TwilioForm = Record<string, string | undefined>;

// ponytail: no X-Twilio-Signature check, add it before real people's data flows through here
@Controller()
export class AnchorController {
  private readonly logger = new Logger(AnchorController.name);

  constructor(private readonly anchor: AnchorService) {}

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  page() {
    return readFileSync(join(__dirname, 'assets', 'index.html'), 'utf8');
  }

  @Get('state')
  state() {
    return this.anchor.state();
  }

  @Post('news')
  async news(@Body() body: { text: string }) {
    return { ack: await this.anchor.addNews({ text: body.text }) };
  }

  @Post('whatsapp')
  @HttpCode(200)
  @Header('content-type', 'text/xml')
  whatsapp(@Body() body: TwilioForm) {
    const from = body.From ?? '';
    const isAudio = body.MediaContentType0?.startsWith('audio/');
    (async () => {
      const audio = isAudio && body.MediaUrl0 ? { data: await download(body.MediaUrl0), mimeType: body.MediaContentType0 ?? '' } : undefined;
      const ack = await this.anchor.addNews({ text: body.Body || undefined, audio }, from);
      await sendWhatsApp(from, ack);
    })().catch((error) => this.logger.error(error));
    return twiml();
  }

  @Post('call')
  @HttpCode(204)
  async call(@Headers('host') host: string, @Headers('x-forwarded-host') forwardedHost?: string) {
    await this.anchor.startCall(process.env.PUBLIC_URL || `https://${forwardedHost ?? host}`).catch((error: Error) => {
      throw new BadGatewayException(error.message);
    });
  }

  @Post('voice/status')
  @HttpCode(204)
  status(@Body() body: TwilioForm) {
    this.anchor.callStatus(body?.CallStatus ?? '');
  }

  @Post('voice/:step')
  @HttpCode(200)
  @Header('content-type', 'text/xml')
  async voice(@Param('step') step: string, @Body() body: TwilioForm) {
    return this.anchor.toTwiml(await this.anchor.step(step, body?.SpeechResult ?? ''));
  }

  @Post('phone/ring')
  @HttpCode(204)
  ring() {
    this.anchor.ring();
  }

  @Post('phone/:step')
  @HttpCode(200)
  async phone(@Param('step') step: string, @Body() audio: Buffer, @Headers('content-type') contentType = '') {
    const recording = Buffer.isBuffer(audio) && audio.length > 0 ? { data: audio, mimeType: contentType.split(';')[0] } : undefined;
    const speech = recording ? await this.anchor.transcribe(recording.data, recording.mimeType) : '';
    return this.anchor.browserTurn(await this.anchor.step(step, speech, recording));
  }

  @Get('audio/:file')
  audio(@Param('file') file: string) {
    const clip = this.anchor.audioFile(file.replace(/\.wav$/, ''));
    if (!clip) throw new NotFoundException();
    return new StreamableFile(clip.data, { type: clip.mimeType });
  }

  @Get('demo.html')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="anchor-demo.html"')
  demo() {
    const demo = JSON.stringify(this.anchor.demo()).replace(/</g, '\\u003c');
    return this.page().replace('<script>', () => `<script>window.DEMO = ${demo};</script>\n<script>`);
  }
}
