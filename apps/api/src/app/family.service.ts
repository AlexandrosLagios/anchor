import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { statSync } from 'node:fs';
import { demoNow } from './core/clock';
import { createRouter } from './core/router';
import { openStore } from './core/store';
import type { Feature } from './core/types';
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
    if (!token) return;
    this.start(token).catch((error) => {
      if (!this.stop.signal.aborted) this.logger.error(`The family bot stopped: ${error}`);
    });
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
    this.stop.abort();
  }

  private async start(token: string) {
    const file = process.env.ANCHOR_STATE_FILE || 'tmp/anchor-state.json';
    const store = openStore(file);
    const configured = Number(process.env.ANCHOR_DAY_SECONDS);
    const daySeconds = configured > 0 ? configured : 86400;
    const telegram = await TelegramTransport.connect(token, this.stop.signal);
    const now = () => demoNow(store.state.clockStart, daySeconds);
    const router = createRouter(FEATURES, { now, store, transport: () => telegram });

    // the tick never saves, so the first window reaches back to the last save, and a restart skips no slot
    let from = demoNow(store.state.clockStart, daySeconds, statSync(file).mtimeMs);
    let ticking = false;
    this.timer = setInterval(async () => {
      if (ticking) return;
      ticking = true;
      const to = now();
      try {
        await router.tick({ from, to });
      } catch (error) {
        this.logger.error(`The tick failed: ${error}`);
      } finally {
        from = to;
        ticking = false;
      }
    }, 2000);

    try {
      this.logger.log(`The family bot polls Telegram as @${telegram.username}, one demo day every ${daySeconds} s`);
      await telegram.poll((event) => router.route(event), this.stop.signal);
    } finally {
      clearInterval(this.timer);
    }
  }
}
