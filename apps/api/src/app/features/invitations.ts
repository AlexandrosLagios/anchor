import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { dayIndex, slotIn } from '../core/clock';
import { lines } from '../core/lines';
import { byPriority } from '../core/priority';
import {
  Blocked,
  type Context,
  type Family,
  type Feature,
  type Incoming,
  type Invitation,
  type Moment,
  type Outgoing,
  type Storyteller,
  type Transport,
} from '../core/types';
import { ask, speak, valid } from '../gemini';
import { wordCount } from './capture/filter';

export const GAP_DAYS = [1, 2, 4, 8, 16, 32];
export const MAX_RETURNS = 7;
const VOICE_STYLE = 'warm, calm and slow, like a kind family friend talking to a grandparent';
const KINDS = ['story', 'unsure', 'other'] as const;
const REPLY_SCHEMA = {
  type: 'object',
  properties: { transcript: { type: 'string' }, kind: { type: 'string', enum: KINDS } },
  required: ['transcript', 'kind'],
};
const BUTTON = /^inv:(later|never|share|keep):(.+)$/;
const logger = new Logger('Invitations');

type Reading = { kind: (typeof KINDS)[number]; transcript: string };

export function qualifies(moment: Moment, storytellerId: string, now: number): boolean {
  const back = moment.returns[storytellerId];
  return (
    moment.by.id !== storytellerId &&
    !moment.sensitive &&
    now - moment.savedAt >= 3 * 3_600_000 &&
    (back?.due ?? 0) <= now &&
    (back?.count ?? 0) < MAX_RETURNS
  );
}

export function nextSlot(now: number): number {
  const slot = new Date(now);
  slot.setHours(11, 0, 0, 0);
  if (slot.getTime() <= now) slot.setDate(slot.getDate() + 1);
  return slot.getTime();
}

function afterDays(time: number, days: number) {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

const isCommand = (text: string | undefined, command: string) => text === command || !!text?.startsWith(`${command} `);

function warnUnlessBlocked(error: unknown, what: string): undefined {
  if (error instanceof Blocked) throw error;
  logger.warn(`${what} failed: ${error}`);
  return undefined;
}

async function tell(storyteller: Storyteller, message: Outgoing, family: Family, ctx: Context) {
  try {
    await ctx.transport(family.id).send(storyteller.id, message);
  } catch (error) {
    if (error instanceof Blocked) {
      storyteller.started = false;
      ctx.store.save();
    } else logger.warn(`A message to storyteller ${storyteller.id} failed: ${error}`);
  }
}

async function announce(family: Family, message: Outgoing, ctx: Context) {
  try {
    return await ctx.transport(family.id).send(family.chatId, message);
  } catch (error) {
    logger.warn(`A post in family ${family.id} failed: ${error}`);
    return undefined;
  }
}

async function deliver(family: Family, storyteller: Storyteller, moment: Moment, at: number, ctx: Context) {
  const invitation: Invitation = { momentId: moment.id, day: dayIndex(at), messageIds: [], shareAsked: false, helped: false };
  storyteller.invitation = invitation;
  const count = (moment.returns[storyteller.id]?.count ?? 0) + 1;
  moment.returns[storyteller.id] = { count, due: afterDays(at, GAP_DAYS[count - 1] ?? 0) };
  ctx.store.save();

  const open = () => storyteller.invitation === invitation;
  const transport = ctx.transport(family.id);
  const post = async (message: Outgoing) => {
    const sent = await transport.send(storyteller.id, message);
    invitation.messageIds.push(sent.messageId);
    return sent;
  };
  const text = lines.invitation(moment.by.name, moment.text);
  const buttons = [
    { label: lines.buttons.notNow, data: `inv:later:${moment.id}` },
    { label: lines.buttons.dontBringBack, data: `inv:never:${moment.id}` },
  ];
  try {
    const picture = moment.video ? { video: moment.video } : moment.photo && { photo: moment.photo };
    if (picture) await post(picture).catch((error) => warnUnlessBlocked(error, `The picture of moment ${moment.id}`));
    if (!open()) return;
    try {
      const voice = moment.invitationVoice ?? { wav: await speak(text, VOICE_STYLE) };
      if (!open()) return;
      const sent = await post({ voice, text, buttons });
      moment.invitationVoice ??= sent.voice;
    } catch (error) {
      warnUnlessBlocked(error, `The invitation voice of moment ${moment.id}`);
      if (!open()) return;
      await post({ text, buttons }).catch((error) => warnUnlessBlocked(error, `The invitation of moment ${moment.id}`));
    }
    if (open()) ctx.store.save();
  } catch (error) {
    if (!(error instanceof Blocked)) throw error;
    storyteller.started = false;
    if (open()) storyteller.invitation = undefined;
    ctx.store.save();
  }
}

async function inGroup(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  const transport = ctx.transport(family.id);
  if (isCommand(event.text, '/storyteller')) {
    const person = event.replyToSender;
    if (!person || !(await transport.isAdmin(family.chatId, event.sender.id))) return true;
    if (!family.storytellers.some((storyteller) => storyteller.id === person.id)) {
      family.storytellers.push({ id: person.id, name: person.name, started: false });
      ctx.store.save();
    }
    const start = { label: lines.buttons.start, url: transport.startLink(family.id) };
    await announce(family, { text: lines.storytellerStart(person.name), buttons: [start] }, ctx);
    return true;
  }
  if (!isCommand(event.text, '/invite')) return false;
  if (!(await transport.isAdmin(family.chatId, event.sender.id))) return true;
  for (const storyteller of family.storytellers) {
    if (!storyteller.started) continue;
    const now = ctx.now();
    const priority = byPriority(now);
    const returns = (moment: Moment) => moment.returns[storyteller.id]?.count ?? 0;
    const [moment] = family.moments
      .filter((item) => !item.sensitive && item.by.id !== storyteller.id && returns(item) < MAX_RETURNS)
      .sort((a, b) => returns(a) - returns(b) || priority(a, b));
    if (moment) {
      await deliver(family, storyteller, moment, now, ctx);
      continue;
    }
    if (storyteller.invitation) {
      storyteller.invitation = undefined;
      ctx.store.save();
    }
    await announce(family, { text: lines.nothingToInvite(storyteller.name) }, ctx);
  }
  return true;
}

async function inPrivate(event: Incoming, family: Family, storyteller: Storyteller, ctx: Context): Promise<boolean> {
  if (isCommand(event.text, '/start')) {
    if (!storyteller.started) {
      storyteller.started = true;
      ctx.store.save();
    }
    await tell(storyteller, { text: lines.welcome(storyteller.name) }, family, ctx);
    return true;
  }
  const [, action, momentId] = event.button?.match(BUTTON) ?? [];
  if ((event.button && !action) || event.text?.startsWith('/')) return false;
  if (action === 'never') {
    const moment = family.moments.find((item) => item.id === momentId);
    if (moment) moment.sensitive = true;
    if (storyteller.invitation?.momentId === momentId) storyteller.invitation = undefined;
    ctx.store.save();
    await tell(storyteller, { text: lines.dontBringBack }, family, ctx);
    return true;
  }
  const invitation = storyteller.invitation;
  if (action && invitation?.momentId !== momentId) return true;
  if (!invitation) return false;
  const moment = family.moments.find((item) => item.id === invitation.momentId);
  if (!moment) {
    storyteller.invitation = undefined;
    ctx.store.save();
    return false;
  }
  if (action) await settle(action, invitation, moment, family, storyteller, ctx);
  else await reply(event, invitation, moment, family, storyteller, ctx);
  return true;
}

async function settle(action: string, invitation: Invitation, moment: Moment, family: Family, storyteller: Storyteller, ctx: Context) {
  const story = invitation.story;
  if (action === 'share' && !story) return;
  storyteller.invitation = undefined;
  if (action === 'later') {
    moment.returns[storyteller.id].due = nextSlot(ctx.now());
    ctx.store.save();
    await tell(storyteller, { text: lines.notNow }, family, ctx);
  } else if (action === 'keep') {
    ctx.store.save();
    await tell(storyteller, { text: lines.notShared }, family, ctx);
  } else {
    const added = await announce(family, { text: lines.storyAdded(storyteller.name), replyTo: moment.messageIds[0] }, ctx);
    const quoted = await announce(family, story.voice ? { voice: story.voice } : { text: `«${story.text}»` }, ctx);
    if (family.moments.includes(moment)) {
      moment.stories.push({
        id: randomUUID(),
        by: { id: storyteller.id, name: storyteller.name },
        at: ctx.now(),
        text: story.text,
        voice: story.voice,
        messageIds: [added?.messageId, quoted?.messageId].filter(Boolean),
      });
    }
    ctx.store.save();
    await tell(storyteller, { text: lines.shared }, family, ctx);
  }
}

async function reply(event: Incoming, invitation: Invitation, moment: Moment, family: Family, storyteller: Storyteller, ctx: Context) {
  const reading: Reading =
    event.unsupported || event.forwarded ? { kind: 'other', transcript: '' } : await readReply(event, moment, ctx.transport(family.id));
  if (storyteller.invitation !== invitation) return;
  if (reading.kind === 'story') {
    const text = event.voice ? reading.transcript || lines.voiceNote : (event.text ?? '');
    invitation.story = invitation.story
      ? { text: `${invitation.story.text}\n${text}`, voice: invitation.story.voice ?? event.voice }
      : { text, voice: event.voice };
    const first = !invitation.shareAsked;
    invitation.shareAsked = true;
    ctx.store.save();
    if (!first) return;
    const buttons = [
      { label: lines.buttons.share, data: `inv:share:${moment.id}` },
      { label: lines.buttons.dontShare, data: `inv:keep:${moment.id}` },
    ];
    await tell(storyteller, { text: lines.thanks, buttons }, family, ctx);
    return;
  }
  if (invitation.story) return;
  if (reading.kind === 'unsure' && !invitation.helped) {
    invitation.helped = true;
    ctx.store.save();
    await tell(storyteller, { text: lines.gentleHelp(dateOf(moment), moment.title) }, family, ctx);
    if (moment.voice && storyteller.invitation === invitation) await tell(storyteller, { voice: moment.voice }, family, ctx);
    return;
  }
  storyteller.invitation = undefined;
  ctx.store.save();
  await tell(storyteller, { text: lines.warmClose }, family, ctx);
}

function dateOf(moment: Moment) {
  const date = moment.eventDate ? new Date(`${moment.eventDate}T12:00`) : new Date(moment.savedAt);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function readReply(event: Incoming, moment: Moment, transport: Transport): Promise<Reading> {
  try {
    const media = event.voice ? [await transport.download(event.voice)] : [];
    const answer = await ask<{ kind?: unknown; transcript?: unknown } | null>(replyPrompt(event, moment), REPLY_SCHEMA, { media, fast: true });
    const kind = valid.oneOf(answer?.kind, KINDS);
    if (kind) return { kind, transcript: valid.text(answer.transcript) };
    logger.warn('The reply call returned no valid kind');
  } catch (error) {
    logger.warn(`The reply call failed: ${error}`);
  }
  return { kind: event.voice || wordCount(event.text) >= 3 ? 'story' : 'other', transcript: '' };
}

function replyPrompt(event: Incoming, moment: Moment) {
  return [
    "You read replies for Anchor, the keeper of a family's photos and stories.",
    'Anchor sent a moment that the family shared to a grandparent, one of the family storytellers, and the grandparent replied in a private chat.',
    `The moment: ${moment.title}`,
    `${moment.by.name} shared: «${moment.text}»`,
    `The typed reply: «${event.text ?? ''}»`,
    'When the reply holds a voice note, set transcript to its words, verbatim. Otherwise set transcript to an empty string.',
    'Set kind to one of these values:',
    '- story: a detail, a feeling, or a memory that the moment brings back.',
    '- unsure: a hesitation or a question, for example "a school?".',
    '- other: an acknowledgement, for example "ok" or an emoji.',
  ].join('\n');
}

export const invitations: Feature = {
  name: 'invitations',

  async handle(event, family, ctx) {
    if (!family) return false;
    if (event.chat === 'group') return inGroup(event, family, ctx);
    const storyteller = family.storytellers.find((person) => person.id === event.sender.id);
    return storyteller ? inPrivate(event, family, storyteller, ctx) : false;
  },

  async tick(family, window, ctx) {
    const slot = slotIn(window, 11);
    if (slot === undefined) return;
    for (const storyteller of family.storytellers) {
      if (!storyteller.started || storyteller.lastInvitationDay === dayIndex(slot)) continue;
      storyteller.invitation = undefined;
      storyteller.lastInvitationDay = dayIndex(slot);
      const [moment] = family.moments.filter((item) => qualifies(item, storyteller.id, slot)).sort(byPriority(slot));
      if (moment) await deliver(family, storyteller, moment, slot, ctx);
      else ctx.store.save();
    }
  },
};
