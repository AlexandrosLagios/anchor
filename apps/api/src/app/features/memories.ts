import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { dayIndex, slotIn } from '../core/clock';
import { lines } from '../core/lines';
import { byPriority, isAnniversary } from '../core/priority';
import type { Context, Family, Feature, Incoming, Media, Moment } from '../core/types';
import { transcribe } from '../model/model';
import { react } from './capture/capture';
import { ADDRESS, isCommand, pictureOf, wordCount } from './capture/filter';

const logger = new Logger('Memories');
const AGES = ['7', '30', '365'] as const;

export function dueKeys(moment: Moment, now: number): string[] {
  if (moment.sensitive) return [];
  const keys: string[] = [];
  for (const age of AGES) {
    if (dayIndex(now) - dayIndex(moment.savedAt) >= Number(age) && !moment.lookbacks.includes(age)) keys.push(age);
  }
  const anniversaryKey = `anniversary-${new Date(now).getFullYear()}`;
  if (isAnniversary(moment.eventDate, now) && !moment.lookbacks.includes(anniversaryKey)) keys.push(anniversaryKey);
  return keys;
}

export function labelFor(moment: Moment, keys: string[]): string {
  const anniversaryKey = keys.find((key) => key.startsWith('anniversary-'));
  if (anniversaryKey) return lines.labels.anniversary(Number(moment.eventDate?.slice(0, 4)));
  const age = [...AGES].reverse().find((candidate) => keys.includes(candidate)) ?? '7';
  return lines.labels[age];
}

function firstDue(moments: Moment[], now: number) {
  const priority = byPriority(now);
  return moments
    .map((moment) => ({ moment, keys: dueKeys(moment, now) }))
    .filter((item) => item.keys.length > 0)
    .sort((a, b) => priority(a.moment, b.moment))[0];
}

async function post(family: Family, moment: Moment, label: string, keys: string[], ctx: Context) {
  moment.lookbacks.push(...keys);
  const text = lines.memoryCaption(label, moment);
  const message = { ...pictureOf(moment), text };
  try {
    const { messageId } = await ctx.transport(family.id).send(family.chatId, message);
    moment.memoryPostIds.push(messageId);
  } catch (error) {
    logger.warn(`failed to post a memory for family ${family.id}: ${error}`);
  }
  ctx.store.save();
}

// section 4.3: posts a group memory now, as /memory and the `memory` intent both do
export async function postMemoryNow(family: Family, ctx: Context): Promise<void> {
  const shareable = family.moments.filter((moment) => !moment.sensitive);
  if (shareable.length === 0) {
    await ctx.transport(family.id).send(family.chatId, { text: lines.nothingToShare });
    return;
  }
  const now = ctx.now();
  const due = firstDue(shareable, now);
  if (due) {
    await post(family, due.moment, labelFor(due.moment, due.keys), due.keys, ctx);
    return;
  }
  const fewest = [...shareable].sort((a, b) => a.memoryPostIds.length - b.memoryPostIds.length || byPriority(now)(a, b))[0];
  await post(family, fewest, lines.labels.fromRecord, [], ctx);
}

async function handleMemoryCommand(family: Family, ctx: Context): Promise<boolean> {
  await postMemoryNow(family, ctx);
  return true;
}

async function transcribeVoice(voice: Media, family: Family, ctx: Context): Promise<string> {
  try {
    const clip = await ctx.transport(family.id).download(voice);
    const transcript = await transcribe(clip);
    return transcript || lines.voiceNote;
  } catch {
    return lines.voiceNote;
  }
}

async function handleStory(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  const replyTo = event.replyTo;
  if (!replyTo) return false;
  if (ADDRESS.test(event.text ?? '')) return false;
  if (event.text?.startsWith('/')) return false;
  const moment = family.moments.find((item) => item.memoryPostIds.includes(replyTo));
  if (!moment || event.unsupported || event.forwarded) return false;
  if (!event.voice && wordCount(event.text) < 3) return false;

  const text = event.voice ? await transcribeVoice(event.voice, family, ctx) : (event.text ?? '');

  if (!family.moments.includes(moment)) return true;

  moment.stories.push({ id: randomUUID(), by: event.sender, at: ctx.now(), text, voice: event.voice, messageIds: [event.messageId] });
  ctx.store.save();
  await react(ctx, family, event.chatId, event.messageId, '\u2764');
  return true;
}

export const memories: Feature = {
  name: 'memories',

  async tick(family, window, ctx) {
    const slot = slotIn(window, 18);
    if (slot === undefined || family.lastMemoryDay === dayIndex(slot)) return;
    family.lastMemoryDay = dayIndex(slot);
    const due = firstDue(family.moments, slot);
    if (!due) {
      ctx.store.save();
      return;
    }
    await post(family, due.moment, labelFor(due.moment, due.keys), due.keys, ctx);
  },

  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family) return false;
    if (isCommand(event.text, '/memory')) return handleMemoryCommand(family, ctx);
    return handleStory(event, family, ctx);
  },
};
