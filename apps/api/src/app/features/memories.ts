import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { dayIndex, slotIn } from '../core/clock';
import { lines } from '../core/lines';
import { byPriority, isAnniversary } from '../core/priority';
import type { Context, Family, Feature, Incoming, Media, Moment } from '../core/types';
import { transcribe } from '../gemini';
import { wordCount } from './capture/filter';

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

async function post(family: Family, moment: Moment, label: string, keys: string[], ctx: Context) {
  moment.lookbacks.push(...keys);
  const text = lines.memoryCaption(label, moment.by.name, moment.text);
  const message = moment.video ? { video: moment.video, text } : moment.photo ? { photo: moment.photo, text } : { text };
  try {
    const { messageId } = await ctx.transport(family.id).send(family.chatId, message);
    moment.memoryPostIds.push(messageId);
  } catch (error) {
    logger.warn(`failed to post a memory for family ${family.id}: ${error}`);
  }
  ctx.store.save();
}

async function handleMemoryCommand(event: Incoming, family: Family, ctx: Context): Promise<boolean> {
  if (!(await ctx.transport(family.id).isAdmin(event.chatId, event.sender.id))) return true;
  const shareable = family.moments.filter((moment) => !moment.sensitive);
  if (shareable.length === 0) {
    await ctx.transport(family.id).send(family.chatId, { text: lines.nothingToShare });
    return true;
  }
  const now = ctx.now();
  const due = shareable.filter((moment) => dueKeys(moment, now).length > 0).sort(byPriority(now));
  if (due.length > 0) {
    const moment = due[0];
    const keys = dueKeys(moment, now);
    await post(family, moment, labelFor(moment, keys), keys, ctx);
    return true;
  }
  const fewest = [...shareable].sort((a, b) => a.memoryPostIds.length - b.memoryPostIds.length || byPriority(now)(a, b))[0];
  await post(family, fewest, lines.labels.fromRecord, [], ctx);
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
  const moment = family.moments.find((item) => item.memoryPostIds.includes(replyTo));
  if (!moment || event.unsupported || event.forwarded) return false;
  if (!event.voice && wordCount(event.text) < 3) return false;

  const text = event.voice ? await transcribeVoice(event.voice, family, ctx) : (event.text ?? '');

  if (!family.moments.includes(moment)) return true;

  moment.stories.push({ id: randomUUID(), by: event.sender, at: ctx.now(), text, voice: event.voice, messageIds: [event.messageId] });
  ctx.store.save();
  try {
    await ctx.transport(family.id).react(event.chatId, event.messageId, '\u2764');
  } catch (error) {
    logger.warn(`failed to react to a story for family ${family.id}: ${error}`);
  }
  return true;
}

export const memories: Feature = {
  name: 'memories',

  async tick(family, window, ctx) {
    const slot = slotIn(window, 18);
    if (slot === undefined || family.lastMemoryDay === dayIndex(slot)) return;
    family.lastMemoryDay = dayIndex(slot);
    const due = family.moments.filter((moment) => dueKeys(moment, slot).length > 0).sort(byPriority(slot));
    if (due.length === 0) {
      ctx.store.save();
      return;
    }
    const moment = due[0];
    const keys = dueKeys(moment, slot);
    await post(family, moment, labelFor(moment, keys), keys, ctx);
  },

  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family) return false;
    if (event.text === '/memory' || event.text?.startsWith('/memory ')) return handleMemoryCommand(event, family, ctx);
    return handleStory(event, family, ctx);
  },
};
