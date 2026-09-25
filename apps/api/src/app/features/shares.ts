import { Logger } from '@nestjs/common';
import { closeOffer, fadeOffers, findOffer, sendOffer } from '../core/offers';
import { lines } from '../core/lines';
import type { Context, Family, Feature, Incoming, Member, Moment } from '../core/types';
import { sendNow } from './invitations';

const BUTTON = /^shr:(yes|no|stop):(.+)$/;
const logger = new Logger('Shares');

function recipientsFor(family: Family, sender: Member): Member[] {
  return family.members.filter((member) => member.id !== sender.id && member.started && member.choices.moments);
}

async function offerFor(family: Family, moment: Moment, ctx: Context) {
  const sender = family.members.find((member) => member.id === moment.by.id);
  if (!sender || !sender.choices.shares) return;
  if (family.offers.some((offer) => offer.kind === 'share' && offer.ref === moment.id)) return;
  const recipients = recipientsFor(family, sender);
  if (!recipients.length) return;
  const names = recipients.map((member) => member.name);
  await sendOffer(
    family,
    'share',
    sender,
    moment.id,
    (id) => ({
      text: lines.shareOffer(names),
      buttons: [
        { label: lines.buttons.sendIt, data: `shr:yes:${id}` },
        { label: lines.buttons.noThanks, data: `shr:no:${id}` },
        { label: lines.buttons.stopOffering, data: `shr:stop:${id}` },
      ],
    }),
    ctx,
  );
}

async function removeTap(family: Family, event: Incoming, ctx: Context) {
  try {
    await ctx.transport(family.id).remove(event.chatId, event.messageId, event.sender.id);
  } catch (error) {
    logger.warn(`Removing the tapped share message failed: ${error}`);
  }
}

export const shares: Feature = {
  name: 'shares',

  async handle(event, family, ctx) {
    if (!family || event.chat !== 'group') return false;
    const [, action, id] = event.button?.match(BUTTON) ?? [];
    if (!action) return false;
    const offer = findOffer(family, id);
    if (!offer || offer.kind !== 'share' || offer.to !== event.sender.id) {
      await removeTap(family, event, ctx);
      return true;
    }
    if (action === 'no') {
      await closeOffer(family, offer, ctx);
      return true;
    }
    if (action === 'stop') {
      const member = family.members.find((item) => item.id === offer.to);
      if (member) {
        member.choices.shares = false;
        ctx.store.save();
      }
      await closeOffer(family, offer, ctx, { text: lines.offersOff });
      return true;
    }
    const moment = family.moments.find((item) => item.id === offer.ref);
    const sender = family.members.find((item) => item.id === offer.to);
    const recipients = moment && !moment.sensitive && sender ? recipientsFor(family, sender) : [];
    if (!moment || moment.sensitive || !recipients.length) {
      await closeOffer(family, offer, ctx);
      return true;
    }
    for (const recipient of recipients) await sendNow(family, recipient, moment, ctx);
    await closeOffer(family, offer, ctx, { text: lines.shareSent(recipients.map((member) => member.name)) });
    return true;
  },

  async tick(family, window, ctx) {
    await fadeOffers(family, 'share', window.to, ctx);
    for (const moment of family.moments) {
      if (moment.savedAt <= window.from || moment.savedAt > window.to || moment.sensitive) continue;
      await offerFor(family, moment, ctx);
    }
  },
};
