import { lines } from '../core/lines';
import type { Feature } from '../core/types';

export const intro: Feature = {
  name: 'intro',
  async handle(event, family, ctx) {
    if (event.migratedTo) {
      if (!family) return true;
      const shell = ctx.store.family(event.migratedTo);
      // Telegram announces the new supergroup with a join before the migration, and that join made an empty family
      if (shell && !shell.moments.length && !shell.members.length) ctx.store.state.families.splice(ctx.store.state.families.indexOf(shell), 1);
      family.id = family.chatId = event.migratedTo;
      // a supergroup numbers its messages from 1 again, so the old ids would point at other messages
      for (const moment of family.moments) {
        moment.messageIds = [];
        moment.memoryPostIds = [];
        if (moment.echoPostIds) moment.echoPostIds = [];
        for (const story of moment.stories) story.messageIds = [];
      }
      ctx.store.save();
      return true;
    }
    if (!event.joined || !event.familyId) return false;
    const joined = family ?? ctx.store.addFamily(event.familyId, event.chatId);
    ctx.store.save();
    const buttons = [{ label: lines.buttons.chooseForMe, url: ctx.transport(joined.id).startLink(joined.id) }];
    await ctx.transport(joined.id).send(event.chatId, { text: lines.intro, buttons });
    return true;
  },
};
