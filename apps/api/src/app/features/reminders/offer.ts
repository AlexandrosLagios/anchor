import { Logger } from '@nestjs/common';
import type { Family, Incoming } from '../../core/types';
import * as model from '../../model/model';
import { TIME } from './rules';

const logger = new Logger('Reminders');

// the prompt holds names only, so only the reply hint lets the model map "Dad" or "you" to a member id
function buildPrompt(event: Incoming, family: Family, now: number) {
  const clock = new Date(now).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const replied = family.members.find((member) => member.id === event.replyToSender?.id);
  return (
    "You are Anchor, the keeper of this family's record. Read one message from the family group chat.\n" +
    'Decide whether one family member must remember a future action that has a time or a trigger, for example "take my pills when we leave in the morning". ' +
    'Say no by default. Plans for the whole family, past events, questions, and jokes get offer false.\n' +
    'A message that names a day after tomorrow, such as a weekday, a date, or "next week", gets offer false. "Tomorrow", "tonight", and "in the morning" are fine.\n' +
    `The sender is ${event.sender.name} (id ${event.sender.id}). On the family clock it is now ${clock}.\n` +
    (replied ? `The message replies to a message from ${replied.name} (id ${replied.id}), so "you" or a family title such as "Dad" can mean ${replied.name}.\n` : '') +
    'The family members:\n' +
    family.members.map((member) => `- id ${member.id}: ${member.name}`).join('\n') +
    `\nThe message: "${event.text}"\n` +
    'Set who to the id of the member who must remember. When the sender must remember, who is the id of the sender. ' +
    'When the person who must remember is not in the list, who is "unknown". ' +
    'Set time to HH:MM in 24-hour local time, or an empty string. "In the morning" means 08:00 and "tonight" means 20:00. A stated clock time wins.'
  );
}

/** Section 6.8: the member and the time of a reminder offer, or undefined for no offer. */
export async function readOffer(event: Incoming, family: Family, now: number): Promise<{ to: string; time: string } | undefined> {
  const ids = family.members.map((member) => member.id);
  const schema = {
    type: 'object',
    properties: { offer: { type: 'boolean' }, who: { type: 'string', enum: [...ids, 'unknown'] }, time: { type: 'string' } },
    required: ['offer', 'who', 'time'],
  };
  try {
    const answer = await model.ask<{ offer?: unknown; who?: unknown; time?: unknown }>(buildPrompt(event, family, now), schema, { fast: true });
    const to = model.valid.oneOf(answer.who, ids); // unknown, or a person who is not a member, gets no offer
    if (answer.offer !== true || !to) return undefined;
    const time = typeof answer.time === 'string' && TIME.test(answer.time) ? answer.time : '';
    return { to, time };
  } catch (error) {
    logger.warn(`The reminder offer call failed: ${error}`);
    return undefined;
  }
}
