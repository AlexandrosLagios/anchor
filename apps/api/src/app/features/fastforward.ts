import { lines } from '../core/lines';
import type { Feature } from '../core/types';

export const fastforward: Feature = {
  name: 'fastforward',
  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family || !event.text || !/^\/fastforward(\s|$)/.test(event.text)) return false;
    if (!(await ctx.transport(family.id).isAdmin(event.chatId, event.sender.id))) return true;
    const match = event.text.match(/^\/fastforward\s+(\d+)\s*$/);
    const days = match ? Number(match[1]) : NaN;
    if (!match || days < 1 || days > 400) {
      await ctx.transport(family.id).send(event.chatId, { text: lines.fastforwardUsage, replyTo: event.messageId });
      return true;
    }
    ctx.store.state.clockOffset += days * 86_400_000;
    ctx.store.save();
    const date = new Date(ctx.now()).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
    await ctx.transport(family.id).send(event.chatId, { text: lines.fastforwarded(date), replyTo: event.messageId });
    return true;
  },
};
