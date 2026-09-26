import { Logger } from '@nestjs/common';
import { lines } from '../../core/lines';
import { shortId } from '../../core/offers';
import { tell } from '../../core/tell';
import type { Birthday, Context, Family, Incoming, Member, Reminder } from '../../core/types';
import * as model from '../../model/model';
import { nextSteps } from '../members';
import { data, groupText, noThanks, who } from './rules';

const logger = new Logger('Birthdays');

const MENTION = /\b(?:birthdays?|b-?days?)\b|γενέθλι/i;
const JUST_PASSED_MS = 330 * 86_400_000;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const mentionsBirthday = (event: Incoming) => groupText(event, MENTION);

export const monthDay = (now: number) => {
  const date = new Date(now);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** 09:00 on the next `MM-DD` after `now`. */
export function birthdayDue(now: number, date: string): number {
  const [month, day] = date.split('-').map(Number);
  const at = new Date(now);
  at.setMonth(month - 1, day);
  at.setHours(9, 0, 0, 0);
  if (at.getTime() <= now) at.setFullYear(at.getFullYear() + 1);
  return at.getTime();
}

export const dayLabel = (date: string) =>
  new Date(2000, Number(date.slice(0, 2)) - 1, Number(date.slice(3))).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

const SCHEMA = {
  type: 'object',
  properties: { birthdays: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' } }, required: ['name', 'date'] } } },
  required: ['birthdays'],
};

async function readBirthdays(event: Incoming, family: Family, now: number): Promise<Array<{ name: string; date: string }>> {
  const today = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const prompt = [
    "You are Anchor, the keeper of this family's record. Read one message from the family group chat.",
    'List every birthday that the message tells, with the person and the day. A wish such as "Happy birthday, Maria!" tells that today is the birthday of Maria.',
    'A birthday with no day, such as "we need a present for Maria\'s birthday", gets no entry.',
    `The sender is ${event.sender.name}. On the family clock, today is ${today}.`,
    `The family members: ${family.members.map((member) => member.name).join(', ')}.`,
    `The message: "${event.text}"`,
    'For each birthday, set name to the person as the family calls them, from the side of the sender: write "Eleni\'s mum" for "my mum" from Eleni. ' +
      'Set date to MM-DD. Count "tomorrow" and a weekday from today.',
  ].join('\n');
  try {
    const answer = await model.ask<{ birthdays?: unknown }>(prompt, SCHEMA, { fast: true });
    const found = Array.isArray(answer.birthdays) ? (answer.birthdays as Array<{ name?: unknown; date?: unknown }>) : [];
    return found.flatMap(({ name, date }) => {
      const who = model.valid.text(name, 60);
      return who && typeof date === 'string' && MONTH_DAY.test(date) ? [{ name: who, date }] : [];
    });
  } catch (error) {
    logger.warn(`The birthday call failed: ${error}`);
    return [];
  }
}

async function offer(family: Family, birthday: Birthday, event: Incoming, ctx: Context) {
  const due = birthdayDue(ctx.now(), birthday.date);
  const to = family.members.filter(
    (member) => member.started && member.choices.reminders && member.name.toLowerCase() !== birthday.name.toLowerCase(),
  );
  const offers = to.map((member) => {
    const reminder: Reminder = {
      id: shortId(),
      to: member.id,
      from: event.sender,
      text: event.text ?? '',
      sourceId: event.messageId,
      time: '09:00',
      due,
      status: 'offered',
      birthday: birthday.name,
    };
    family.reminders.push(reminder);
    return { member, reminder };
  });
  ctx.store.save();
  const buttons = (id: string) => [{ label: lines.buttons.remindMe, data: data(id, 'yes') }, noThanks(id)];
  await Promise.all(
    offers.map(({ member, reminder }) =>
      tell(family, member, { text: lines.birthdayOffer(who(reminder), birthday.name, dayLabel(birthday.date)), buttons: buttons(reminder.id) }, ctx),
    ),
  );
}

/** A group message that tells a birthday saves it, and each member who started gets a reminder offer in private. */
export async function noticeBirthdays(family: Family, event: Incoming, ctx: Context): Promise<void> {
  ctx.store.joinMember(family, event.sender);
  const found = await readBirthdays(event, family, ctx.now());
  const birthdays = (family.birthdays ??= []);
  const now = ctx.now();
  const offered: Birthday[] = [];
  for (const { name, date } of found) {
    const known = birthdays.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (known?.date === date) continue; // the family already got the offer
    const birthday = known ?? { name, date, from: event.sender };
    birthday.date = date;
    if (!known) birthdays.push(birthday);
    // on the day itself, or just after it, the family already talks about it
    if (date !== monthDay(now) && birthdayDue(now, date) - now < JUST_PASSED_MS) offered.push(birthday);
  }
  if (found.length) ctx.store.save();
  for (const birthday of offered) await offer(family, birthday, event, ctx);
}

/** "Remind me about this month's birthdays": the list, and a 09:00 reminder on the day of each one still to come. */
export async function birthdaysThisMonth(family: Family, member: Member, sourceId: string, ctx: Context): Promise<void> {
  const now = ctx.now();
  const month = monthDay(now).slice(0, 2);
  const byDue = [...(family.birthdays ?? [])].sort((a, b) => birthdayDue(now, a.date) - birthdayDue(now, b.date));
  const thisMonth = byDue.filter((birthday) => birthday.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  if (!thisMonth.length) {
    const next = byDue[0];
    await tell(family, member, { text: lines.noBirthdays(next && `${next.name}, ${dayLabel(next.date)}`), buttons: nextSteps(member) }, ctx);
    return;
  }
  const year = new Date(now).getFullYear();
  const coming = thisMonth.filter((birthday) => new Date(birthdayDue(now, birthday.date)).getFullYear() === year);
  for (const birthday of coming) {
    const due = birthdayDue(now, birthday.date);
    const same = family.reminders.find((item) => item.to === member.id && item.birthday === birthday.name && item.due === due);
    if (same?.status === 'offered') same.status = 'set';
    if (same) continue;
    family.reminders.push({
      id: shortId(),
      to: member.id,
      from: birthday.from,
      text: `${birthday.name}'s birthday`,
      sourceId,
      time: '09:00',
      due,
      status: 'set',
      birthday: birthday.name,
    });
  }
  // the member asked for the reminders, so the choice is on
  if (coming.length) member.choices.reminders = true;
  ctx.store.save();
  const items = thisMonth.map((birthday) => `${birthday.name}, ${dayLabel(birthday.date)}`);
  await tell(family, member, { text: lines.birthdaysThisMonth(items, coming.length > 0) }, ctx);
}
