import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Req, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { FamilyService } from './family.service';
import { deleteMyData, join, media, me, moments, myData, verifyIdToken } from './web';

// the website API of the family bot (docs/specs/2026-09-26-website-registration-with-telegram.md); only the host that polls Telegram holds the record
@Controller('web')
export class WebController {
  constructor(private readonly family: FamilyService) {}

  private async caller(req: Request) {
    const bot = this.family.web;
    if (!bot) throw new ServiceUnavailableException('The family bot does not run here');
    return { ...bot, user: await verifyIdToken(req.header('authorization'), bot.botId) };
  }

  @Post('join')
  @HttpCode(200)
  async join(@Req() req: Request) {
    const { user, ctx, addLink } = await this.caller(req);
    return join(user, ctx, addLink);
  }

  @Get('me')
  async me(@Req() req: Request) {
    const { user, ctx } = await this.caller(req);
    return me(user, ctx);
  }

  @Get('moments')
  async moments(@Req() req: Request) {
    const { user, ctx } = await this.caller(req);
    return moments(user, ctx);
  }

  @Get('moments/:id/:kind')
  async media(@Req() req: Request, @Param('id') id: string, @Param('kind') kind: string) {
    if (kind !== 'photo' && kind !== 'voice') throw new NotFoundException();
    const { user, ctx } = await this.caller(req);
    const file = await media(user, ctx, id, kind);
    return new StreamableFile(file.data, { type: file.mimeType });
  }

  @Get('my-data')
  async myData(@Req() req: Request) {
    const { user, ctx } = await this.caller(req);
    return myData(user, ctx);
  }

  @Delete('my-data')
  @HttpCode(204)
  async deleteMyData(@Req() req: Request) {
    const { user, ctx } = await this.caller(req);
    deleteMyData(user, ctx);
  }
}
