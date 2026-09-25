import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { demoNow } from './core/clock';
import { createRouter } from './core/router';
import { openStore } from './core/store';
import type { Context, Feature } from './core/types';
import { intro } from './features/intro';
import { TelegramTransport } from './transports/telegram';

const FEATURES: Feature[] = [intro];

@Injectable()
export class FamilyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FamilyService.name);
  private readonly stop = new AbortController();
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) this.start(token).catch((error) => this.logger.error(`The family bot stopped: ${error}`));
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
    this.stop.abort();
  }

  private async start(token: string) {
    const store = openStore(process.env.ANCHOR_STATE_FILE || 'tmp/anchor-state.json');
    const daySeconds = Number(process.env.ANCHOR_DAY_SECONDS) || 86400;
    const telegram = await TelegramTransport.connect(token);
    if (this.stop.signal.aborted) return;
    const ctx: Context = { now: () => demoNow(store.state.clockStart, daySeconds), store, transport: () => telegram };
    const router = createRouter(FEATURES, ctx);

    let from = ctx.now();
    let ticking = false;
    this.timer = setInterval(async () => {
      if (ticking) return;
      ticking = true;
      const to = ctx.now();
      try {
        await router.tick({ from, to });
      } finally {
        from = to;
        ticking = false;
      }
    }, 2000);

    this.logger.log(`The family bot polls Telegram as @${telegram.username}, one demo day every ${daySeconds} s`);
    await telegram.poll((event) => router.route(event), this.stop.signal);
  }
}
