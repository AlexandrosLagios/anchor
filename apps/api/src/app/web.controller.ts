import { Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Req, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import type { Context, Person } from './core/types';
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

  private async run<T>(req: Request, handle: (user: Person, ctx: Context) => T) {
    const { user, ctx } = await this.caller(req);
    return handle(user, ctx);
  }

  @Post('join')
  @HttpCode(200)
  async join(@Req() req: Request) {
    const { user, ctx, addLink } = await this.caller(req);
    return join(user, ctx, addLink);
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.run(req, me);
  }

  @Get('moments')
  moments(@Req() req: Request) {
    return this.run(req, moments);
  }

  @Get('moments/:id/:kind')
  async media(@Req() req: Request, @Param('id') id: string, @Param('kind') kind: string) {
    if (kind !== 'photo' && kind !== 'voice') throw new NotFoundException();
    const { user, ctx } = await this.caller(req);
    const file = await media(user, ctx, id, kind);
    return new StreamableFile(file.data, { type: file.mimeType });
  }

  @Get('my-data')
  myData(@Req() req: Request) {
    return this.run(req, myData);
  }

  @Delete('my-data')
  @HttpCode(204)
  async deleteMyData(@Req() req: Request) {
    await this.run(req, deleteMyData);
  }
}
