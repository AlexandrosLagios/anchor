import { Logger } from '@nestjs/common';
import { lines, type ChoiceName } from '../core/lines';
import { tell } from '../core/tell';
import type { Button, Context, Family, Feature, Member } from '../core/types';

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

export function groupNextSteps(family: Family, ctx: Context): Button[] {
  return [
    { label: lines.buttons.showMemory, data: 'nxt:memory' },
    { label: lines.buttons.chooseForMe, url: ctx.transport(family.id).startLink(family.id) },
  ];
}

// the flag goes up before the send, so a failed send never repeats the nudge
export async function nudge(family: Family, member: Member, ctx: Context) {
  member.nudged = true;
  ctx.store.save();
  const transport = ctx.transport(family.id);
  const buttons = [{ label: lines.buttons.chooseForMe, url: transport.startLink(family.id) }];
  try {
    await transport.send(family.chatId, { text: lines.nudge(member.name), buttons, onlyFor: member.id });
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

// ponytail: step 5 lands /start, the set: buttons, the contact, "stop", and the join nudge in this feature
export const members: Feature = { name: 'members' };
