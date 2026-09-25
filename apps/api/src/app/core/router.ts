import { Logger } from '@nestjs/common';
import { lines } from './lines';
import type { Context, Feature, Incoming, Window } from './types';

const logger = new Logger('Router');

export function createRouter(features: Feature[], ctx: Context) {
  return {
    async route(event: Incoming) {
      const family = event.familyId ? ctx.store.family(event.familyId) : ctx.store.familyOfMember(event.sender.id);
      for (const feature of features) if (await feature.handle?.(event, family, ctx)) return;
      if (event.chat !== 'private') return;
      // a private chat id carries the transport prefix of a family id
      await ctx.transport(family?.id ?? event.chatId).send(event.chatId, { text: lines.pointer });
    },

    async tick(window: Window) {
      for (const family of ctx.store.state.families) {
        for (const feature of features) {
          try {
            await feature.tick?.(family, window, ctx);
          } catch (error) {
            logger.error(`${feature.name} tick failed for family ${family.id}: ${error}`);
          }
        }
      }
    },
  };
}
