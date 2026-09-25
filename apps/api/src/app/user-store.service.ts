import { Injectable, Logger } from '@nestjs/common';
import type { ChatLine, Moment } from './anchor.service';
import { databaseConfigured, getPool } from './db';

@Injectable()
export class UserStoreService {
  private readonly logger = new Logger(UserStoreService.name);

  async persistSnapshot(uid: string, state: { chat: ChatLine[]; moments: Moment[]; activeId?: string }) {
    if (!databaseConfigured()) return;
    try {
      await getPool().query(
        `INSERT INTO user_states (user_id, chat, moments, active_id, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, now())
         ON CONFLICT (user_id) DO UPDATE SET
           chat = EXCLUDED.chat,
           moments = EXCLUDED.moments,
           active_id = EXCLUDED.active_id,
           updated_at = now()`,
        [uid, JSON.stringify(state.chat), JSON.stringify(state.moments), state.activeId ?? null],
      );
    } catch (error) {
      this.logger.warn(`Neon persist failed for ${uid}: ${String(error)}`);
    }
  }
}
