import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Button, Context, Family, Member, Offer, Outgoing } from './types';

const logger = new Logger('Offers');

// v2, sections 4.12 and 4.13: an unanswered offer fades after this long
export const FADE_MS = 10 * 60_000;

export async function sendOffer(
  family: Family,
  kind: Offer['kind'],
  to: Member,
  ref: string,
  message: (id: string) => Outgoing,
  ctx: Context,
): Promise<Offer | undefined> {
  const id = randomUUID().replace(/-/g, '').slice(0, 8);
  try {
    const sent = await ctx.transport(family.id).send(family.chatId, { ...message(id), onlyFor: to.id });
    const offer: Offer = { id, kind, to: to.id, messageId: sent.messageId, at: ctx.now(), ref };
    family.offers.push(offer);
    ctx.store.save();
    return offer;
  } catch (error) {
    logger.warn(`The ${kind} offer to ${to.id} failed: ${error}`);
    return undefined;
  }
}

export function findOffer(family: Family, id: string): Offer | undefined {
  return family.offers.find((offer) => offer.id === id);
}

export async function closeOffer(family: Family, offer: Offer, ctx: Context, change?: { text?: string; buttons?: Button[] }): Promise<void> {
  const transport = ctx.transport(family.id);
  try {
    if (change) await transport.edit(family.chatId, offer.messageId, { ...change, onlyFor: offer.to });
    else await transport.remove(family.chatId, offer.messageId, offer.to);
  } catch (error) {
    logger.warn(`Closing the ${offer.kind} offer ${offer.id} failed: ${error}`);
  }
  family.offers.splice(family.offers.indexOf(offer), 1);
  ctx.store.save();
}

export async function fadeOffers(family: Family, kind: Offer['kind'], now: number, ctx: Context): Promise<Offer[]> {
  const faded = family.offers.filter((offer) => offer.kind === kind && now - offer.at >= FADE_MS);
  if (!faded.length) return faded;
  const transport = ctx.transport(family.id);
  for (const offer of faded) {
    try {
      await transport.remove(family.chatId, offer.messageId, offer.to);
    } catch (error) {
      logger.warn(`Fading the ${kind} offer ${offer.id} failed: ${error}`);
    }
    family.offers.splice(family.offers.indexOf(offer), 1);
  }
  ctx.store.save();
  return faded;
}
