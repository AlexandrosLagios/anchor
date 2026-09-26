import { Logger } from '@nestjs/common';
import { grounded, unsupported } from '../core/grounded';
import { cut, dateOf, lines } from '../core/lines';
import { tell } from '../core/tell';
import type { Context, Family, Feature, Member, Moment } from '../core/types';
import { ask, valid } from '../model/model';
import { pictureOf } from './capture/filter';
import { dayLabel } from './reminders/birthdays';

const logger = new Logger('Talk');
const KEEP_LINES = 50;
const KEEP_TURNS = 10;
export const clock = (at: number) => new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A forgotten moment leaves the chat context too. */
export function unlog(family: Family, messageIds: string[]) {
  if (family.chat) family.chat = family.chat.filter((line) => !messageIds.includes(line.id));
}

// a moment without an eventDate carries the day of the share, so an answer never gives that day as the day of the event
function momentLine(moment: Moment, withId = false) {
  const stories = moment.stories.map((story) => `${story.by.name}: «${cut(story.text, 200)}»`).join(' ');
  const when = `${moment.eventDate ? 'happened on' : 'shared on'} ${dateOf(moment)}`;
  return `- ${withId ? `id ${moment.id}: ` : ''}${lines.sharedBy(moment, 300)} (${when})${moment.description ? ` ${moment.description}` : ''}${stories ? ` Stories: ${stories}` : ''}`;
}

function shared(family: Family) {
  const quiet = new Set(family.moments.filter((moment) => moment.sensitive).flatMap((moment) => moment.messageIds));
  const moments = family.moments.filter((moment) => !moment.sensitive);
  const chat = (family.chat ?? []).filter((line) => !quiet.has(line.id)).map((line) => `- ${clock(line.at)} ${line.by}: ${line.text}`);
  const birthdays = family.birthdays?.length ? [`Birthdays the family mentioned: ${family.birthdays.map((item) => `${item.name}, ${dayLabel(item.date)}`).join('; ')}.`] : [];
  return { moments, chat, birthdays, members: `The family members: ${family.members.map((person) => person.name).join(', ')}.` };
}

/** The family record, the birthdays, and the latest group lines, with the rules to answer from them, in private or on a call. */
// ponytail: every moment and the last 50 group lines go into the prompt; shortlist by the question when a record reaches thousands of moments
export function familyContext(family: Family, withIds = false): string[] {
  const { moments, chat, birthdays, members } = shared(family);
  return [
    'Use only what the family record and the group chat below say. When they do not say, say so honestly. Never invent a fact, a date, or a feeling.',
    'When the person hesitates or remembers something differently, help gently and never correct them.',
    members,
    'The moments in the family record:',
    ...(moments.length ? moments.map((moment) => momentLine(moment, withIds)) : ['(none yet)']),
    ...birthdays,
    'The latest messages in the family group, oldest first:',
    ...(chat.length ? chat : ['(none yet)']),
  ];
}

type Where = 'private' | 'group';

function prompt(family: Family, member: Member, text: string, now: number, where: Where, focus?: Moment): string {
  return [
    "You are Anchor, the keeper of this family's shared photos and stories in their Telegram group. You are not a person: never claim feelings, a body, or memories of your own.",
    where === 'private'
      ? `${member.name}, a member of the family, talks to you in a private chat.`
      : `${member.name}, a member of the family, asks you in the family group, where everyone reads the answer.`,
    `On the family clock it is now ${clock(now)}.`,
    'Answer the last message in one to three short sentences of plain, warm words, in the language of the message.',
    'When a moment answers it, say who shared it and when, and quote a few of their words or of a story word for word, in «». ' +
      'When two moments belong together, such as the same kind of event for two people of the family, link them in one sentence.',
    'Copy every name, date, and number exactly as the record writes it. A moment "shared on" a day may have happened earlier.',
    'A story tells the life of the person who told it. Never move a detail from one person or one moment to another.',
    'When the record does not answer the question, say so in the first sentence, then share the closest moment.',
    'List in momentIds the id of each moment that your answer uses, the most relevant first, or leave it empty.',
    'Never add an opinion, a wish, or a guess about how someone feels, such as "it will be nice" or "she seems happy".',
    'Never promise to do something later, such as a reminder, a call, or a message to someone else.',
    ...familyContext(family, true),
    ...(focus ? [`The message asks about the moment with id ${focus.id}.`] : []),
    ...(where === 'private' && member.talk?.length
      ? [`Your private chat with ${member.name} so far:`, ...member.talk.map((turn) => `${turn.from === 'anchor' ? 'Anchor' : member.name}: ${turn.text}`)]
      : []),
    `${member.name}: ${text}`,
  ].join('\n');
}

export type Answer = { text: string; cited: Moment[]; grounded: boolean };

/**
 * Answers from the record with the moments that the answer cites, the focus first. The answer is grounded when every number, name, and quote in it comes
 * from the cited moments, the group chat, the birthdays, or the words of the member; undefined when the call fails.
 */
export async function answer(family: Family, member: Member, text: string, ctx: Context, where: Where = 'private', focus?: Moment): Promise<Answer | undefined> {
  const now = ctx.now();
  const { moments, chat, birthdays, members } = shared(family);
  const ids = moments.map((moment) => moment.id);
  const schema = {
    type: 'object',
    properties: { answer: { type: 'string' }, momentIds: { type: 'array', items: { type: 'string', enum: [...ids, 'none'] } } },
    required: ['answer', 'momentIds'],
  };
  try {
    const reply = await ask<{ answer?: unknown; momentIds?: unknown }>(prompt(family, member, text, now, where, focus), schema);
    const said = valid.text(reply.answer, 1000);
    if (!said) return undefined;
    const cited = [...new Set([focus?.id, ...valid.strings(reply.momentIds)])].flatMap((id) => moments.find((moment) => moment.id === id) ?? []);
    const own = where === 'private' ? (member.talk ?? []).filter((turn) => turn.from === 'member').map((turn) => turn.text) : [];
    const sources = [members, clock(now), ...birthdays, ...chat, ...own, text, ...cited.map((moment) => momentLine(moment))];
    const ok = grounded(said, sources);
    if (!ok) logger.warn(`An answer said what its sources do not hold: ${unsupported(said, sources).join(', ')}`);
    return { text: said, cited, grounded: ok };
  } catch (error) {
    logger.warn(`The answer call failed: ${error}`);
    return undefined;
  }
}

/** Keeps the latest turns of the private chat, so the next answer can follow on. */
export function remember(member: Member, text: string, said: string) {
  const turns = (member.talk ??= []);
  turns.push({ from: 'member', text: cut(text, 500) }, { from: 'anchor', text: said });
  turns.splice(0, turns.length - KEEP_TURNS);
}

/**
 * A private message that asks for nothing Anchor can do gets an answer from the record and the group chat, then the photo of the moment it cites, so the
 * member sees where the answer came from. An answer that fails the check gives way to recordSays and the photo, or to notFound. False when the call fails.
 */
export async function answerTalk(family: Family, member: Member, text: string, ctx: Context): Promise<boolean> {
  const reply = await answer(family, member, text, ctx);
  if (!reply) return false;
  const lead = reply.cited[0];
  const said = reply.grounded ? reply.text : lead ? lines.recordSays : lines.notFound;
  remember(member, text, said);
  ctx.store.save();
  await tell(family, member, { text: said }, ctx);
  if (lead && (pictureOf(lead) || !reply.grounded)) await tell(family, member, { ...pictureOf(lead), text: lines.source(lead) }, ctx);
  return true;
}

// keeps the latest group lines, the context of a private chat; first in the router, so it sees every group message
// ponytail: the log rides along with the next save of any feature, so a restart loses the lines since then; save here when that matters
export const talk: Feature = {
  name: 'talk',
  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family || !event.text || event.forwarded || event.button !== undefined || event.text.startsWith('/')) return false;
    const chat = (family.chat ??= []);
    chat.push({ id: event.messageId, by: event.sender.name, text: `${event.photo || event.video ? '(photo) ' : ''}${cut(event.text, 500)}`, at: ctx.now() });
    chat.splice(0, chat.length - KEEP_LINES);
    return false;
  },
};
