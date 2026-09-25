import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Context, Family, Feature, Moment } from '../../core/types';
import { classify } from './classify';
import type { Classification } from './classify';
import { BUNDLE_GAP_MS, isClosed, passesRules, typedText, worthClassifying } from './filter';
import type { Bundle } from './filter';

const logger = new Logger('Capture');

export const bundles: Bundle[] = [];

const FORGET = /^anchor\b[,:]?\s+forget this\b/i;
const KEEP_QUIET = /^anchor\b[,:]?\s+don['’]t bring this back\b/i;

function count(family: Family, key: string) {
  family.counters[key] = (family.counters[key] ?? 0) + 1;
}

function removeBundle(bundle: Bundle) {
  const index = bundles.indexOf(bundle);
  if (index >= 0) bundles.splice(index, 1);
}

async function react(ctx: Context, family: Family, chatId: string, messageId: string, emoji: string) {
  try {
    await ctx.transport(family.id).react(chatId, messageId, emoji);
  } catch (error) {
    logger.warn(`react on ${chatId}/${messageId} failed: ${error}`);
  }
}

function findMoment(family: Family, messageId: string): Moment | undefined {
  return family.moments.find((moment) => moment.messageIds.includes(messageId) || moment.memoryPostIds.includes(messageId));
}

function findMomentOfStory(family: Family, messageId: string): Moment | undefined {
  return family.moments.find((moment) => moment.stories.some((story) => story.messageIds.includes(messageId)));
}

export const forget: Feature = {
  name: 'forget',
  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family) return false;
    const text = event.text ?? '';
    const isForget = FORGET.test(text);
    const isKeepQuiet = !isForget && KEEP_QUIET.test(text);
    if (!isForget && !isKeepQuiet) return false;
    if (!event.replyTo) return true;

    const replyTo = event.replyTo;
    const openBundle = bundles.find((bundle) => bundle.familyId === family.id && bundle.events.some((e) => e.messageId === replyTo));
    let changed = false; // a bundle removal is in-memory only and never needs a save

    if (isForget) {
      if (openBundle) removeBundle(openBundle);
      const moment = findMoment(family, replyTo);
      if (moment) {
        family.moments.splice(family.moments.indexOf(moment), 1);
        changed = true;
      } else {
        const momentOfStory = findMomentOfStory(family, replyTo);
        if (momentOfStory) {
          const storyIndex = momentOfStory.stories.findIndex((story) => story.messageIds.includes(replyTo));
          momentOfStory.stories.splice(storyIndex, 1);
          changed = true;
        }
      }
    } else {
      if (openBundle) openBundle.sensitive = true;
      const moment = findMoment(family, replyTo) ?? findMomentOfStory(family, replyTo);
      if (moment && !moment.sensitive) {
        moment.sensitive = true;
        changed = true;
      }
    }

    if (changed) ctx.store.save();
    await react(ctx, family, event.chatId, event.messageId, '👌');
    return true;
  },
};

async function close(bundle: Bundle, family: Family, ctx: Context) {
  bundle.closing = true;

  if (!worthClassifying(bundle)) {
    removeBundle(bundle);
    count(family, 'rules');
    ctx.store.save();
    return;
  }

  let classification: Classification | undefined;
  try {
    classification = await classify(bundle, ctx.transport(family.id));
  } catch (error) {
    logger.warn(`classification failed for family ${family.id}: ${error}`);
    classification = undefined;
  }

  if (!bundles.includes(bundle)) return; // a forget deleted it while the classification was in flight
  removeBundle(bundle);

  if (!classification) {
    count(family, 'failed');
    ctx.store.save();
    return;
  }

  count(family, classification.verdict);
  if (classification.verdict !== 'family_moment' && classification.verdict !== 'sensitive') {
    ctx.store.save();
    return;
  }

  const moment: Moment = {
    id: randomUUID(),
    by: bundle.sender,
    messageIds: bundle.events.map((event) => event.messageId),
    savedAt: ctx.now(),
    text: typedText(bundle) || classification.transcript || classification.title,
    photo: bundle.events.find((event) => event.photo)?.photo,
    video: bundle.events.find((event) => event.video)?.video,
    voice: bundle.events.find((event) => event.voice)?.voice,
    salience: classification.salience,
    people: classification.people,
    eventDate: classification.eventDate,
    title: classification.title,
    sensitive: classification.verdict === 'sensitive' || bundle.sensitive === true,
    stories: [],
    lookbacks: [],
    memoryPostIds: [],
    returns: {},
  };
  family.moments.push(moment);
  ctx.store.save();
  await react(ctx, family, family.chatId, bundle.events[0].messageId, '\u2764');
}

export const capture: Feature = {
  name: 'capture',
  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family) return false;

    if (!passesRules(event)) {
      count(family, 'rules');
      ctx.store.save();
      return true;
    }

    const candidates = bundles.filter(
      (bundle) => bundle.familyId === family.id && bundle.sender.id === event.sender.id && !bundle.closing,
    );
    const open = candidates[candidates.length - 1];
    const last = open?.events[open.events.length - 1];
    if (open && last && event.at - last.at <= BUNDLE_GAP_MS) {
      open.events.push(event);
    } else {
      bundles.push({ familyId: family.id, sender: event.sender, events: [event] });
    }
    return true;
  },

  async tick(family, _window, ctx) {
    const due = bundles.filter((bundle) => bundle.familyId === family.id && !bundle.closing && isClosed(bundle, Date.now()));
    await Promise.all(due.map((bundle) => close(bundle, family, ctx)));
  },
};
