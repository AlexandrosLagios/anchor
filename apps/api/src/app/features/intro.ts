import { lines } from '../core/lines';
import type { Feature } from '../core/types';

export const intro: Feature = {
  name: 'intro',
  async handle(event, family, ctx) {
    if (!event.joined || !event.familyId) return false;
    const joined = family ?? ctx.store.addFamily(event.familyId, event.chatId);
    ctx.store.save();
    await ctx.transport(joined.id).send(event.chatId, { text: lines.intro });
    return true;
  },
};
