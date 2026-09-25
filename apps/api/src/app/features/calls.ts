import { Logger } from '@nestjs/common';
import { type CallRecord, storyOf } from '../call/bridge';
import { answered, ring } from '../call/dial';
import { mulawWav } from '../call/ogg';
import { expectCall, STREAM_PATH } from '../call/stream';
import { dayIndex, slotIn } from '../core/clock';
import { lines } from '../core/lines';
import { tell } from '../core/tell';
import type { Context, Family, Feature, Member, Moment, Reminder, Window } from '../core/types';
import { shareStory } from './invitations';

const log = new Logger('Calls');

const DAILY_HOUR = 11;

/** The voice speaks a line without its emoji, and without the line breaks of a chat message. */
export const spoken = (line: string) =>
  line
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([»,.!?])/g, '$1')
    .trim();

const newestMoment = (family: Family, member: Member) =>
  family.moments.filter((moment) => moment.by.id !== member.id && !moment.sensitive).sort((a, b) => b.savedAt - a.savedAt)[0];

function reminderInstructions(member: Member, reminder: Reminder) {
  return [
    `You are Anchor, the family's record keeper, on a phone call with ${member.name}, a member of the family.`,
    'You are not a person. Never claim feelings or a shared past of your own.',
    `You have already said the opening line, and read a reminder that ${reminder.from.name} wrote: «${spoken(reminder.text)}»`,
    `Answer a short question about the reminder if ${member.name} asks one, in one short sentence.`,
    `Then say out loud: "${spoken(lines.call.goodbye(member.name))}" Then call end_call with share no and tell_sender false.`,
    'Speak slowly and clearly, in simple English.',
  ].join('\n');
}

function instructions(member: Member, moment: Moment) {
  return [
    `You are Anchor, the family's record keeper, on a phone call with ${member.name}, a member of the family.`,
    'You are not a person. Never claim feelings or a shared past of your own.',
    `You have already said the opening line. It quoted a moment that ${moment.by.name} shared in the family chat, and asked what it reminds ${member.name} of: ${spoken(lines.sharedBy(moment))}`,
    "Take one step per turn, and wait for the person's answer before the next step:",
    `1. Listen, and let ${member.name} talk as long as they like. Answer warmly in one short sentence. Ask at most one short follow-up question about what they told you, or skip it when they have said enough.`,
    `2. Ask: "${lines.call.askShare}"`,
    `3. Ask: "${lines.call.reachPerson(moment.by.name)}"`,
    `4. Say out loud: "${spoken(lines.call.goodbye(member.name))}" Then call end_call with their answers.`,
    `When ${member.name} says goodbye or that they are done, say a short goodbye out loud, then call end_call.`,
    'Speak slowly and clearly, in simple English. There is no right answer.',
    'Never mention memory loss, recall, tests, hints, or scores.',
  ].join('\n');
}

async function afterCall(family: Family, member: Member, moment: Moment, record: CallRecord, ctx: Context) {
  const story = storyOf(record);
  if ((record.share === 'voice' || record.share === 'words') && story.text) {
    // the private send uploads the clip once, and the group post reuses its file id
    const sent = record.share === 'voice' && story.audio.length ? await tell(family, member, { voice: { wav: mulawWav(story.audio) }, text: lines.shared }, ctx) : undefined;
    await shareStory(family, member, moment, { text: story.text, voice: sent?.voice }, ctx);
  }
  if (record.tellSender) {
    await ctx
      .transport(family.id)
      .send(family.chatId, { text: lines.wouldLoveCall(member.name, moment.by.name), mention: moment.by })
      .catch((error) => log.warn(`The call request for ${moment.by.id} failed: ${error}`));
  }
}

async function follow(sid: string, call: ReturnType<typeof expectCall>, family: Family, member: Member, moment: Moment | undefined, ctx: Context) {
  try {
    if (!(await answered(sid))) return call.forget();
    const record = await call.ended;
    if (moment) await afterCall(family, member, moment, record, ctx);
  } catch (error) {
    call.forget();
    log.warn(`The call ${sid} to member ${member.id} failed: ${error}`);
  }
}

/**
 * Rings the member with a reminder, or about the newest moment that someone else shared. Resolves once Twilio accepts the
 * call, because the poll awaits each update; the answer, the conversation, and the share run in the background.
 */
export async function callMember(family: Family, member: Member, ctx: Context, reminder?: Reminder): Promise<boolean> {
  const base = process.env.ANCHOR_PUBLIC_URL;
  const moment = reminder ? undefined : newestMoment(family, member);
  if (!member.phone || !process.env.TWILIO_FROM || !base || (!reminder && !moment)) return false;
  const opening = spoken(lines.call.opening(member.name));
  const goodbye = spoken(lines.call.goodbye(member.name));
  const call = expectCall(
    moment
      ? { instructions: instructions(member, moment), opener: `${opening} ${spoken(lines.invitation(moment))}`, askShare: lines.call.askShare, goodbye }
      : { instructions: reminderInstructions(member, reminder), opener: `${opening} ${spoken(lines.reminder(reminder.from.name, reminder.text))}`, goodbye },
  );
  let sid: string;
  try {
    sid = await ring(member.phone, `${base.replace(/^http/, 'ws').replace(/\/$/, '')}${STREAM_PATH}`, call.token);
  } catch (error) {
    call.forget();
    log.warn(`Twilio refused a call to member ${member.id}: ${error}`);
    return false;
  }
  await tell(family, member, { text: lines.calling }, ctx);
  void follow(sid, call, family, member, moment, ctx);
  return true;
}

/** 11:00 on the demo-clock day of the last daily call. */
function lastCallAt(member: Member): number {
  if (member.lastCallDay === undefined) return -Infinity;
  const day = new Date(member.lastCallDay * 86_400_000);
  return new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), DAILY_HOUR).getTime();
}

export const calls: Feature = {
  name: 'calls',
  async tick(family: Family, window: Window, ctx: Context) {
    const slot = slotIn(window, DAILY_HOUR);
    for (const member of family.members) {
      if (!member.started || !member.choices.call || !member.phone) continue;
      for (const reminder of family.reminders) {
        if (reminder.to === member.id && reminder.sentAt !== undefined && reminder.sentAt > window.from && reminder.sentAt <= window.to) {
          await callMember(family, member, ctx, reminder);
        }
      }
      const moment = newestMoment(family, member);
      if (slot === undefined || member.lastCallDay === dayIndex(slot) || !moment || moment.savedAt <= lastCallAt(member)) continue;
      member.lastCallDay = dayIndex(slot);
      ctx.store.save();
      await callMember(family, member, ctx);
    }
  },
};
