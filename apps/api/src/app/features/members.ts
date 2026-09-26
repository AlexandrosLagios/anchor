import { Logger } from '@nestjs/common';
import { lines, type ChoiceName } from '../core/lines';
import { tell } from '../core/tell';
import type { Button, Context, Family, Feature, Incoming, Member } from '../core/types';
import { ADDRESS, isCommand } from './capture/filter';

const logger = new Logger('Members');

export const CHOICES: ChoiceName[] = ['moments', 'reminders', 'shares', 'voice', 'call'];

// v2, section 4.11: the call button shows only when Anchor has a number to call from
const shown = () => CHOICES.filter((name) => name !== 'call' || process.env.TWILIO_FROM);

export function choiceButtons(member: Member): Button[] {
  const toggles = shown().map((name) => ({ label: lines.choice(member.choices[name], lines.buttons.choices[name]), data: `set:${name}` }));
  return [...toggles, { label: lines.buttons.done, data: 'set:done' }];
}

export async function showChoices(family: Family, member: Member, text: string, ctx: Context) {
  await tell(family, member, { text, buttons: choiceButtons(member) }, ctx);
}

// v2, section 4.6: the code picks the next steps of a private answer, never the model; `except` drops the step that was just answered
export function nextSteps(member: Member, except?: string): Button[] {
  const steps = [
    { label: lines.buttons.anotherMoment, data: 'nxt:sendMe' },
    { label: lines.buttons.whatDidIMiss, data: 'nxt:missed' },
    { label: lines.buttons.mySettings, data: 'nxt:settings' },
    ...(member.choices.call ? [{ label: lines.buttons.callMe, data: 'nxt:callMe' }] : []),
  ];
  return steps.filter((step) => step.data !== `nxt:${except}`);
}

export const chooseButton = (family: Family, ctx: Context): Button => ({
  label: lines.buttons.chooseForMe,
  url: ctx.transport(family.id).startLink(family.id),
});

export function groupNextSteps(family: Family, ctx: Context): Button[] {
  return [{ label: lines.buttons.showMemory, data: 'nxt:memory' }, chooseButton(family, ctx)];
}

// the flag goes up before the send, so a failed send never repeats the nudge
export async function nudge(family: Family, member: Member, ctx: Context) {
  member.nudged = true;
  ctx.store.save();
  try {
    await ctx.transport(family.id).send(family.chatId, { text: lines.nudge(member.name), buttons: [chooseButton(family, ctx)], onlyFor: member.id });
  } catch (error) {
    logger.warn(`The nudge to ${member.id} failed: ${error}`);
  }
}

// v2, section 4.7: "stop" turns every choice off and closes the open invitation silently; Anchor still answers the member
export async function stopMember(family: Family, member: Member, ctx: Context) {
  for (const name of CHOICES) member.choices[name] = false;
  member.started = false;
  member.invitation = undefined;
  ctx.store.save();
  await tell(family, member, { text: lines.stopped }, ctx);
}

const STOP = /^stop[.!]?$/i;

function findFamilyByPayload(payload: string, ctx: Context): Family | undefined {
  const byId = ctx.store.family(payload);
  if (byId) return byId;
  const reminderId = payload.startsWith('r_') ? payload.slice(2) : undefined;
  if (!reminderId) return undefined;
  return ctx.store.state.families.find((item) => item.reminders.some((reminder) => reminder.id === reminderId));
}

export async function isInGroup(family: Family, userId: string, ctx: Context): Promise<boolean> {
  try {
    return await ctx.transport(family.id).isMember(family.chatId, userId);
  } catch (error) {
    logger.warn(`The membership check of ${userId} failed: ${error}`);
    return false;
  }
}

// the start link travels outside the group, so a person who is new to the record joins only while in the group
async function inGroupChat(family: Family, userId: string, ctx: Context): Promise<boolean> {
  return family.members.some((person) => person.id === userId) || isInGroup(family, userId, ctx);
}

// the payload finds the family also for a person who is not a member yet; the router answers a person with no family
async function start(event: Incoming, family: Family | undefined, ctx: Context): Promise<boolean> {
  const payload = event.text?.slice('/start'.length).trim();
  const target = (payload && findFamilyByPayload(payload, ctx)) || family;
  if (!target) return false;
  if (!(await inGroupChat(target, event.sender.id, ctx))) {
    await ctx.transport(target.id).send(event.chatId, { text: lines.notInGroup });
    return true;
  }
  const member = ctx.store.joinMember(target, event.sender);
  member.started = true;
  ctx.store.save();
  await showChoices(target, member, lines.welcome(member.name), ctx);
  return true;
}

// a tap in private means the member talks to Anchor, so it starts the member again after "stop"
async function setChoice(event: Incoming, family: Family, member: Member, ctx: Context): Promise<boolean> {
  const choice = event.button?.slice('set:'.length);
  if (!member.started) {
    member.started = true;
    ctx.store.save();
  }
  if (choice === 'done') {
    const names = shown()
      .filter((name) => member.choices[name])
      .map((name) => lines.choiceNames[name]);
    await tell(family, member, { text: lines.choicesSaved(names), buttons: nextSteps(member, 'settings') }, ctx);
    return true;
  }
  if (!choice || !CHOICES.includes(choice as ChoiceName)) return false;
  const name = choice as ChoiceName;
  member.choices[name] = !member.choices[name];
  ctx.store.save();
  try {
    await ctx.transport(family.id).edit(member.id, event.messageId, { buttons: choiceButtons(member) });
  } catch (error) {
    logger.warn(`The choice buttons of member ${member.id} failed to edit: ${error}`);
  }
  if (name === 'call' && member.choices.call && !member.phone) {
    await tell(family, member, { text: lines.askPhone, buttons: [{ label: lines.buttons.sharePhone, contact: true }] }, ctx);
  }
  return true;
}

async function shareContact(event: Incoming, family: Family, member: Member, ctx: Context): Promise<boolean> {
  const contact = event.contact;
  if (!contact) return false;
  if (contact.userId !== event.sender.id) {
    await tell(family, member, { text: lines.askPhone, buttons: [{ label: lines.buttons.sharePhone, contact: true }] }, ctx);
    return true;
  }
  member.phone = contact.phone.startsWith('+') ? contact.phone : `+${contact.phone}`;
  ctx.store.save();
  await tell(family, member, { text: lines.phoneSaved }, ctx);
  if (process.env.TWILIO_FROM) await tell(family, member, { contact: { phone: process.env.TWILIO_FROM, name: 'Anchor' } }, ctx);
  return true;
}

async function inPrivate(event: Incoming, family: Family | undefined, ctx: Context): Promise<boolean> {
  if (isCommand(event.text, '/start')) return start(event, family, ctx);
  if (!family) return false;
  const member = family.members.find((person) => person.id === event.sender.id);
  if (!member) return false;
  if (event.button?.startsWith('set:')) return setChoice(event, family, member, ctx);
  if (event.contact) return shareContact(event, family, member, ctx);
  if (isCommand(event.text, '/stop') || STOP.test(event.text?.trim() ?? '')) {
    await stopMember(family, member, ctx);
    return true;
  }
  return false;
}

// v2, section 4.11: the join nudge, on every group message of a member who has not started
async function inGroup(event: Incoming, family: Family | undefined, ctx: Context): Promise<boolean> {
  if (!family || event.button !== undefined || event.joined || event.migratedTo !== undefined || event.ephemeral) return false;
  const isNew = !family.members.some((person) => person.id === event.sender.id);
  const member = ctx.store.joinMember(family, event.sender);
  if (isNew) ctx.store.save();
  // the intents feature answers "Anchor, ..." messages and sends its own nudge
  if (!member.started && !member.nudged && !ADDRESS.test(event.text ?? '')) await nudge(family, member, ctx);
  return false;
}

export const members: Feature = {
  name: 'members',
  async handle(event, family, ctx) {
    return event.chat === 'group' ? inGroup(event, family, ctx) : inPrivate(event, family, ctx);
  },
};
