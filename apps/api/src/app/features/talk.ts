import { Logger } from '@nestjs/common';
import { cut, dateOf, lines } from '../core/lines';
import { tell } from '../core/tell';
import type { Context, Family, Feature, Member } from '../core/types';
import { ask, valid } from '../model/model';
import { dayLabel } from './reminders/birthdays';

const logger = new Logger('Talk');
const KEEP_LINES = 50;
const KEEP_TURNS = 10;
const SCHEMA = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] };

export const clock = (at: number) => new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A forgotten moment leaves the chat context too. */
export function unlog(family: Family, messageIds: string[]) {
  if (family.chat) family.chat = family.chat.filter((line) => !messageIds.includes(line.id));
}

/** The family record, the birthdays, and the latest group lines, with the rules to answer from them, in private or on a call. */
// ponytail: every moment and the last 50 group lines go into the prompt; shortlist by the question when a record reaches thousands of moments
export function familyContext(family: Family): string[] {
  const quiet = new Set(family.moments.filter((moment) => moment.sensitive).flatMap((moment) => moment.messageIds));
  const moments = family.moments.filter((moment) => !moment.sensitive);
  const chat = (family.chat ?? []).filter((line) => !quiet.has(line.id));
  const birthdays = family.birthdays ?? [];
  return [
    'Use only what the family record and the group chat below say. When they do not say, say so honestly. Never invent a fact, a date, or a feeling.',
    'When the person hesitates or remembers something differently, help gently and never correct them.',
    `The family members: ${family.members.map((person) => person.name).join(', ')}.`,
    'The moments in the family record:',
    ...(moments.length
      ? moments.map((moment) => {
          const stories = moment.stories.map((story) => `${story.by.name}: «${cut(story.text, 200)}»`).join(' ');
          return `- ${lines.sharedBy(moment, 300)} (${dateOf(moment)})${moment.description ? ` ${moment.description}` : ''}${stories ? ` Stories: ${stories}` : ''}`;
        })
      : ['(none yet)']),
    ...(birthdays.length ? [`Birthdays the family mentioned: ${birthdays.map((item) => `${item.name}, ${dayLabel(item.date)}`).join('; ')}.`] : []),
    'The latest messages in the family group, oldest first:',
    ...(chat.length ? chat.map((line) => `- ${clock(line.at)} ${line.by}: ${line.text}`) : ['(none yet)']),
  ];
}

function prompt(family: Family, member: Member, text: string, now: number): string {
  return [
    "You are Anchor, the keeper of this family's shared photos and stories in their Telegram group. You are not a person: never claim feelings, a body, or memories of your own.",
    `${member.name}, a member of the family, talks to you in a private chat. On the family clock it is now ${clock(now)}.`,
    'Answer the last message in one to three short sentences of plain, warm words, in the language of the message.',
    'Never add an opinion, a wish, or a guess about how someone feels, such as "it will be nice" or "she seems happy".',
    'Never promise to do something later, such as a reminder, a call, or a message to someone else.',
    ...familyContext(family),
    ...(member.talk?.length ? [`Your private chat with ${member.name} so far:`, ...member.talk.map((turn) => `${turn.from === 'anchor' ? 'Anchor' : member.name}: ${turn.text}`)] : []),
    `${member.name}: ${text}`,
  ].join('\n');
}

/** A private message that asks for nothing Anchor can do gets an answer from the record and the group chat; false when the call fails. */
export async function answerTalk(family: Family, member: Member, text: string, ctx: Context): Promise<boolean> {
  let answer: string;
  try {
    answer = valid.text((await ask<{ answer?: unknown }>(prompt(family, member, text, ctx.now()), SCHEMA)).answer, 1000);
  } catch (error) {
    logger.warn(`The talk call failed: ${error}`);
    return false;
  }
  if (!answer) return false;
  const turns = (member.talk ??= []);
  turns.push({ from: 'member', text: cut(text, 500) }, { from: 'anchor', text: answer });
  turns.splice(0, turns.length - KEEP_TURNS);
  ctx.store.save();
  await tell(family, member, { text: answer }, ctx);
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
