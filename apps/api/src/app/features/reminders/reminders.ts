import { Logger } from '@nestjs/common';
import { lines } from '../../core/lines';
import { closeOffer, editOffer, fadeOffers, findOffer, sendOffer, shortId } from '../../core/offers';
import { tell } from '../../core/tell';
import type { Button, Context, Family, Feature, Incoming, Member, Reminder } from '../../core/types';
import { react } from '../capture/capture';
import { dayLabel, mentionsBirthday, monthDay, noticeBirthdays } from './birthdays';
import { readOffer } from './offer';
import { DEFAULT_TIMES, TIME, around, data, nextLocal, noThanks, passesGate, who } from './rules';

const logger = new Logger('Reminders');

const TAP = /^rem:(\w{8}):(.+)$/;
const START = /^\/start r_(\w{8})$/;

const timeButtons = (offerId: string, times: string[]): Button[] =>
  times.map((time) => ({ label: lines.buttons.remindAt(time), data: data(offerId, time) }));

// an empty time shows the four default times, and nothing to move around
function offerButtons(offerId: string, time: string): Button[] {
  return [
    ...timeButtons(offerId, time ? [time] : DEFAULT_TIMES),
    ...(time ? [{ label: lines.buttons.anotherTime, data: data(offerId, 'more') }] : []),
    noThanks(offerId),
    { label: lines.buttons.stopReminders, data: data(offerId, 'stop') },
  ];
}

function drop(family: Family, reminder: Reminder) {
  family.reminders.splice(family.reminders.indexOf(reminder), 1);
}

/** True when the offer went out. */
export async function makeOffer(family: Family, event: Incoming, ctx: Context): Promise<boolean> {
  ctx.store.joinMember(family, event.sender);
  const reading = await readOffer(event, family, ctx.now());
  if (!reading) return false;
  const member = family.members.find((person) => person.id === reading.to);
  if (!member?.choices.reminders) return false;
  const reminder: Reminder = {
    id: shortId(),
    to: member.id,
    from: event.sender,
    text: event.text ?? '',
    sourceId: event.messageId,
    time: reading.time,
    status: 'offered',
  };
  family.reminders.push(reminder);
  const message = (id: string) => ({ text: lines.reminderOffer(who(reminder), reminder.text), buttons: offerButtons(id, reminder.time) });
  if (await sendOffer(family, 'reminder', member, reminder.id, message, ctx)) return true;
  drop(family, reminder);
  ctx.store.save();
  return false;
}

async function answer(family: Family, id: string, action: string, event: Incoming, ctx: Context) {
  const offer = findOffer(family, id);
  const reminder = offer?.kind === 'reminder' ? family.reminders.find((item) => item.id === offer.ref) : undefined;
  if (!offer || !reminder) {
    try {
      await ctx.transport(family.id).remove(event.chatId, event.messageId, event.sender.id);
    } catch (error) {
      logger.warn(`Removing a closed reminder offer failed: ${error}`);
    }
    return;
  }
  const member = offer.to === event.sender.id ? family.members.find((person) => person.id === offer.to) : undefined;
  if (!member) return;

  if (TIME.test(action)) {
    reminder.time = action;
    if (member.started) {
      reminder.due = nextLocal(ctx.now(), action);
      reminder.status = 'set';
      await closeOffer(family, offer, ctx, { text: lines.reminderSet(action) });
      await react(ctx, family, family.chatId, reminder.sourceId, '✍');
    } else {
      reminder.status = 'waiting';
      ctx.store.save();
      const start = { label: lines.buttons.start, url: ctx.transport(family.id).startLink(`r_${reminder.id}`) };
      await editOffer(family, offer, { text: lines.reminderStart(action), buttons: [start] }, ctx);
    }
  } else if (action === 'more' && reminder.time) {
    await editOffer(family, offer, { buttons: [...timeButtons(offer.id, around(reminder.time)), noThanks(offer.id)] }, ctx);
  } else if (action === 'no') {
    drop(family, reminder);
    await closeOffer(family, offer, ctx);
  } else if (action === 'stop') {
    member.choices.reminders = false;
    drop(family, reminder);
    await closeOffer(family, offer, ctx, { text: lines.offersOff });
  }
}

/** A member asked in private, so the offer goes to the private chat, with no stop button, and it never fades. */
export async function offerInPrivate(family: Family, member: Member, text: string, time: string, sourceId: string, ctx: Context) {
  const reminder: Reminder = { id: shortId(), to: member.id, from: { id: member.id, name: member.name }, text, sourceId, time, status: 'offered' };
  family.reminders.push(reminder);
  ctx.store.save();
  const buttons = offerButtons(reminder.id, time).filter((button) => button.data !== data(reminder.id, 'stop'));
  await tell(family, member, { text: lines.privateReminderOffer(text), buttons }, ctx);
}

// the button data of a private offer holds the reminder id; the answer goes out as a new line, because a voice note has no text to edit
async function answerInPrivate(family: Family, id: string, action: string, event: Incoming, ctx: Context) {
  // "this month's birthdays" can set a birthday reminder while its offer is still open, so a later tap still answers it
  const open = (item: Reminder) => item.status === 'offered' || (item.birthday !== undefined && item.status === 'set');
  const reminder = family.reminders.find((item) => item.id === id && item.to === event.sender.id && open(item));
  const member = reminder && family.members.find((person) => person.id === reminder.to);
  const transport = ctx.transport(family.id);
  const setButtons = (buttons: Button[]) =>
    transport.edit(event.chatId, event.messageId, { buttons }).catch((error) => logger.warn(`Editing a private reminder offer failed: ${error}`));
  if (!reminder || !member) return setButtons([]);

  if (action === 'more' && reminder.time) return setButtons([...timeButtons(id, around(reminder.time)), noThanks(id)]);
  if (action === 'no') {
    drop(family, reminder);
    ctx.store.save();
    await setButtons([]);
    await tell(family, member, { text: lines.notNow }, ctx);
    return;
  }
  const birthday = action === 'yes' && reminder.birthday !== undefined && reminder.due !== undefined;
  if (!birthday && !TIME.test(action)) return;
  if (!birthday) {
    reminder.time = action;
    reminder.due = nextLocal(ctx.now(), action);
  }
  reminder.status = 'set';
  member.choices.reminders = true; // the member asked for this reminder
  ctx.store.save();
  await setButtons([]);
  const text = birthday ? lines.birthdaySet(reminder.birthday ?? '', dayLabel(monthDay(reminder.due ?? 0))) : lines.reminderConfirmed(action);
  await tell(family, member, { text }, ctx);
}

// the router finds the family of the member, because only a member gets a reminder offer
async function confirm(family: Family, id: string, event: Incoming, ctx: Context) {
  const reminder = family.reminders.find((item) => item.id === id && item.to === event.sender.id && item.status === 'waiting');
  const member = reminder && family.members.find((person) => person.id === reminder.to);
  if (!reminder || !member) return;
  reminder.due = nextLocal(ctx.now(), reminder.time);
  reminder.status = 'set';
  ctx.store.save();
  await tell(family, member, { text: lines.reminderConfirmed(reminder.time) }, ctx);
  await react(ctx, family, family.chatId, reminder.sourceId, '✍');
}

export const reminders: Feature = {
  name: 'reminders',
  async handle(event, family, ctx) {
    if (!family) return false;
    const start = event.chat === 'private' ? event.text?.match(START) : undefined;
    if (start) {
      await confirm(family, start[1], event, ctx); // members then sends the welcome
      return false;
    }
    const tapped = event.button?.match(TAP);
    if (tapped) {
      await (event.chat === 'group' ? answer : answerInPrivate)(family, tapped[1], tapped[2], event, ctx);
      return true;
    }
    if (event.chat !== 'group') return false;
    // ponytail: a birthday mention gets only the birthday offer, so "remind me about Maria's birthday" never gets two offers
    if (mentionsBirthday(event)) await noticeBirthdays(family, event, ctx);
    else if (passesGate(event, ctx.now())) await makeOffer(family, event, ctx); // capture still sees the message
    return false;
  },

  async tick(family, window, ctx) {
    const due = family.reminders.filter((reminder) => reminder.status === 'set' && reminder.due !== undefined && reminder.due <= window.to);
    for (const reminder of due) {
      reminder.status = 'sent';
      reminder.sentAt = window.to; // inside the window, so the calls tick of the same window sees the delivery
    }
    if (due.length) ctx.store.save();
    for (const reminder of due) {
      const member = family.members.find((person) => person.id === reminder.to);
      const text = reminder.birthday ? lines.birthdayToday(reminder.birthday) : lines.reminder(who(reminder), reminder.text);
      if (member?.choices.reminders) await tell(family, member, { text }, ctx);
    }

    const faded = new Set((await fadeOffers(family, 'reminder', window.to, ctx)).map((offer) => offer.ref));
    const stale = family.reminders.filter((reminder) => faded.has(reminder.id) && (reminder.status === 'offered' || reminder.status === 'waiting'));
    if (!stale.length) return;
    for (const reminder of stale) drop(family, reminder);
    ctx.store.save();
  },
};
