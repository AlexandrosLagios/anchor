import { Logger } from '@nestjs/common';
import { dateOf, lines } from '../core/lines';
import { tell } from '../core/tell';
import type { Context, Family, Feature, Incoming, Member, Moment } from '../core/types';
import * as model from '../model/model';
import { answerInGroup, choiceLine } from './ask';
import { actOnReply } from './capture/capture';
import { ADDRESS, fixedIntent, pictureOf } from './capture/filter';
import { callMember, newestMoment } from './calls';
import { sendMe } from './invitations';
import { postMemoryNow } from './memories';
import { groupNextSteps, nextSteps, nudge, showChoices, stopMember } from './members';

const logger = new Logger('Intents');
const SEVEN_DAYS_MS = 7 * 86_400_000;
const MEMORY_WORDS = /\b(?:memor(?:y|ies)|photos?|pictures?|pics|moments?|albums?)\b/i;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ponytail: one regex per tag and person on each gated message; build one alternation when a record reaches thousands of tags
const namesKnownSubject = (family: Family, text: string) =>
  family.moments.some(
    (moment) =>
      !moment.sensitive &&
      [...(moment.tags ?? []), ...moment.people].some((name) => name.length > 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escaped(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text)),
  );

const INTENTS = ['memory', 'find', 'sendMe', 'missed', 'settings', 'stop', 'callMe', 'forget', 'quiet', 'unclear'] as const;
type Intent = (typeof INTENTS)[number];

// section 6.7: one line per intent, with one example each; the demo phrases carry the wording
const INTENT_EXAMPLES: Partial<Record<Intent, string>> = {
  memory: '"Anchor, show us a memory", "I want a memory of Lucy", or "photos of Lucy" asks Anchor to post a family memory now.',
  find: '"Anchor, when did Maria start school?" asks Anchor to find a moment and answer with it.',
  sendMe: '"Anchor, can you send me the family photos?" or "Send me a moment" asks Anchor to send a moment in private, and names no person, pet, or place. Never memory.',
  missed: '"What did I miss?" asks for the moments the family shared since the person last talked to Anchor.',
  settings: '"Anchor, settings" asks to see or change what Anchor sends.',
  stop: '"stop" asks Anchor to stop sending anything.',
  callMe: '"Call me" asks Anchor to ring the person on the phone.',
  forget: '"Anchor, delete that" or "Anchor, forget that one" asks Anchor to delete a moment.',
  quiet: "\"Anchor, don't show me that one again\" asks Anchor to keep a moment without bringing it back.",
};

function schemaFor(momentIds: string[]) {
  return {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      momentId: { type: 'string', enum: [...momentIds, 'none'] },
      momentIds: { type: 'array', items: { type: 'string', enum: [...momentIds, 'none'] } },
    },
    required: ['intent', 'momentId', 'momentIds'],
  };
}

// ponytail: every shareable moment goes into the prompt; shortlist by people or date when a record reaches thousands of moments
function buildPrompt(chat: 'group' | 'private', text: string, hasVoice: boolean, moments: Moment[], addressed: boolean): string {
  const where = chat === 'group' ? 'the family group' : 'a private chat with one family member';
  return [
    `You are Anchor, the keeper of this family's record. This message came from ${where}${hasVoice ? ', as a voice note' : ''}: "${text}"`,
    ...(addressed
      ? []
      : ['The message does not name Anchor, and the family may be talking to each other. Pick memory only when the message asks for family memories, photos, or moments. Otherwise, pick unclear.']),
    'Pick the intent that best matches the message:',
    ...Object.entries(INTENT_EXAMPLES).map(([intent, example]) => `- ${intent}: ${example}`),
    'Pick the id of the moment the message names or asks about, or "none" when it names none.',
    'For memory, when the message names a person, a pet, a place, or an activity, list in momentIds every moment about it, from the titles and the tags. ' +
      'Include a moment that names the same person or pet only by a general word, such as a "dog" moment when another moment shows that the family dog is Lucy. Otherwise, momentIds is empty.',
    ...moments.map(choiceLine),
  ].join('\n');
}

async function readIntent(
  family: Family,
  event: Incoming,
  chat: 'group' | 'private',
  text: string,
  moments: Moment[],
  ctx: Context,
  addressed = true,
): Promise<{ intent: Intent; momentId?: string; momentIds: string[] }> {
  const momentIds = moments.map((moment) => moment.id);
  const schema = schemaFor(momentIds);
  try {
    const clip = event.voice ? await ctx.transport(family.id).download(event.voice) : undefined;
    const prompt = buildPrompt(chat, text, !!event.voice, moments, addressed);
    const answer = await model.ask<{ intent?: unknown; momentId?: unknown; momentIds?: unknown }>(prompt, schema, clip ? { media: [clip] } : {});
    const intent = model.valid.oneOf(answer.intent, INTENTS) ?? 'unclear';
    const momentId = model.valid.oneOf(answer.momentId, [...momentIds, 'none']);
    const picked = Array.isArray(answer.momentIds) ? answer.momentIds.filter((id) => momentIds.includes(id)) : [];
    return { intent, momentId, momentIds: picked };
  } catch (error) {
    logger.warn(`intent call failed: ${error}`);
    return { intent: 'unclear', momentIds: [] };
  }
}

// 'none' matches no moment id
const findAsked = (family: Family, momentId?: string) => family.moments.find((item) => item.id === momentId && !item.sensitive);

async function unclearGroup(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  await ctx.transport(family.id).send(event.chatId, { text: lines.unclear, replyTo: event.messageId, buttons: groupNextSteps(family, ctx) });
  return true;
}

// the call choice can be on without a number, when the member skipped the share button after the toggle
async function doCallMe(family: Family, member: Member, ctx: Context): Promise<void> {
  if (!member.phone) {
    await tell(family, member, { text: lines.askPhone, buttons: [{ label: lines.buttons.sharePhone, contact: true }] }, ctx);
    return;
  }
  if (!newestMoment(family, member)) {
    await tell(family, member, { text: lines.nothingToCall, buttons: nextSteps(member, 'callMe') }, ctx);
    return;
  }
  const ok = await callMember(family, member, ctx);
  if (!ok) await tell(family, member, { text: lines.callFailed, buttons: nextSteps(member, 'callMe') }, ctx);
}

async function groupAction(
  intent: Intent,
  momentId: string | undefined,
  event: Incoming,
  family: Family,
  member: Member,
  ctx: Context,
  momentIds: string[],
): Promise<boolean> {
  switch (intent) {
    case 'memory':
      await postMemoryNow(family, ctx, [...new Set([momentId, ...momentIds])].flatMap((id) => findAsked(family, id) ?? []));
      return true;
    case 'find': {
      const moment = findAsked(family, momentId);
      if (!moment) {
        await ctx.transport(family.id).send(event.chatId, { text: lines.notFound, replyTo: event.messageId });
        return true;
      }
      await answerInGroup(family, moment, event.messageId, ctx);
      return true;
    }
    case 'sendMe':
    case 'missed':
      if (member.started) await sendMe(family, member, ctx);
      else await nudge(family, member, ctx);
      return true;
    case 'settings':
    case 'stop':
      await nudge(family, member, ctx);
      return true;
    case 'callMe':
      if (member.started) await doCallMe(family, member, ctx);
      else await nudge(family, member, ctx);
      return true;
    case 'forget':
    case 'quiet':
      if (!event.replyTo) return unclearGroup(event, family, ctx);
      await actOnReply(event, family, ctx, intent === 'forget');
      return true;
    default:
      return unclearGroup(event, family, ctx);
  }
}

async function inGroup(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  if (event.button === 'nxt:memory') {
    await postMemoryNow(family, ctx);
    return true;
  }

  const text = event.text ?? '';
  const addressed = ADDRESS.test(text);
  // section 4.16: a message without "Anchor," reaches the intent call only when it asks about memories or photos of a subject that the record
  // knows, and never as a reply to a person
  if (event.forwarded || (!addressed && (event.replyTo !== undefined || !MEMORY_WORDS.test(text) || !namesKnownSubject(family, text)))) return false;
  const question = text.replace(ADDRESS, '');

  const isNew = !family.members.some((candidate) => candidate.id === event.sender.id);
  const member = ctx.store.joinMember(family, event.sender);
  if (isNew) ctx.store.save();

  const moments = family.moments.filter((moment) => !moment.sensitive);
  const phrase = event.voice || !addressed ? undefined : fixedIntent(question);
  // "send me photos of Lucy" names a subject, so the model decides between sendMe and a memory of Lucy (4.16)
  const fixed = phrase === 'sendMe' && /\bof\b/i.test(question) ? undefined : phrase;
  const { intent, momentId, momentIds } = fixed
    ? { intent: fixed, momentId: undefined, momentIds: [] }
    : await readIntent(family, event, 'group', question, moments, ctx, addressed);
  // an unaddressed message gets an answer only when the intent call reads a memory request, so family talk stays untouched
  if (!addressed && intent !== 'memory') return false;
  return groupAction(intent, momentId, event, family, member, ctx, momentIds);
}

async function unclearPrivate(family: Family, member: Member, ctx: Context): Promise<boolean> {
  await tell(family, member, { text: lines.unclear, buttons: nextSteps(member) }, ctx);
  return true;
}

async function privateFind(momentId: string | undefined, family: Family, member: Member, ctx: Context): Promise<void> {
  const moment = findAsked(family, momentId);
  if (!moment) {
    await tell(family, member, { text: lines.notFound, buttons: nextSteps(member, 'find') }, ctx);
    return;
  }
  const names = [...new Set(moment.stories.map((story) => story.by.name))];
  await tell(
    family,
    member,
    { ...pictureOf(moment), text: lines.askAnswer(moment.title, dateOf(moment), names), buttons: nextSteps(member, 'find') },
    ctx,
  );
  const voiceStory = moment.stories.find((story) => story.voice);
  if (voiceStory) await tell(family, member, { voice: voiceStory.voice }, ctx);
  if (moment.savedAt > (member.seenAt ?? 0)) member.seenAt = moment.savedAt;
  ctx.store.save();
}

async function privateMissed(family: Family, member: Member, ctx: Context): Promise<void> {
  const since = member.seenAt ?? ctx.now() - SEVEN_DAYS_MS;
  const candidates = family.moments
    .filter((moment) => !moment.sensitive && moment.by.id !== member.id && moment.savedAt > since)
    .sort((a, b) => a.savedAt - b.savedAt);
  if (!candidates.length) {
    await tell(family, member, { text: lines.nothingNew, buttons: nextSteps(member, 'missed') }, ctx);
    return;
  }
  await tell(family, member, { text: lines.missed(candidates.length) }, ctx);
  const toSend = candidates.slice(0, 3);
  for (const [index, moment] of toSend.entries()) {
    const last = index === toSend.length - 1;
    await tell(family, member, { ...pictureOf(moment), text: lines.sharedBy(moment), ...(last ? { buttons: nextSteps(member, 'missed') } : {}) }, ctx);
  }
  member.seenAt = toSend[toSend.length - 1].savedAt;
  ctx.store.save();
}

async function privateAction(
  intent: Intent,
  momentId: string | undefined,
  family: Family,
  member: Member,
  ctx: Context,
): Promise<boolean> {
  switch (intent) {
    case 'memory':
    case 'sendMe':
      await sendMe(family, member, ctx);
      return true;
    case 'find':
      await privateFind(momentId, family, member, ctx);
      return true;
    case 'missed':
      await privateMissed(family, member, ctx);
      return true;
    case 'settings':
      await showChoices(family, member, lines.choicesScreen, ctx);
      return true;
    case 'stop':
      await stopMember(family, member, ctx);
      return true;
    case 'callMe':
      await doCallMe(family, member, ctx);
      return true;
    default:
      return unclearPrivate(family, member, ctx);
  }
}

async function inPrivate(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  const member = family.members.find((candidate) => candidate.id === event.sender.id);
  if (!member) return false;

  const nxt = event.button?.match(/^nxt:(.+)$/);
  if (nxt) {
    const intent = model.valid.oneOf(nxt[1], INTENTS);
    if (!intent) return unclearPrivate(family, member, ctx);
    return privateAction(intent, undefined, family, member, ctx);
  }
  if (event.button) return unclearPrivate(family, member, ctx);
  if (!event.text && !event.voice) return unclearPrivate(family, member, ctx);

  const moments = family.moments.filter((moment) => !moment.sensitive);
  const fixed = event.voice ? undefined : fixedIntent(event.text);
  const { intent, momentId } = fixed ? { intent: fixed, momentId: undefined } : await readIntent(family, event, 'private', event.text ?? '', moments, ctx);
  return privateAction(intent, momentId, family, member, ctx);
}

export const intents: Feature = {
  name: 'intents',
  async handle(event, family, ctx) {
    if (!family) return false;
    return event.chat === 'group' ? inGroup(event, family, ctx) : inPrivate(event, family, ctx);
  },
};
