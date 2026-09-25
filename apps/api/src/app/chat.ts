import { BadRequestException } from '@nestjs/common';
import { cut } from './core/lines';
import { valid } from './gemini';
import type { Moment } from './anchor.service';

export type ChatTurn = { role: 'user' | 'anchor'; text: string };

export type ChatMemory = {
  id: string;
  who: string;
  what: string;
  when: string;
  memory: string;
  caption: string;
};

export type ChatFileRef = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

const MAX_TURNS = 16;
const MAX_TEXT = 2000;

export function normalizeTurns(input: unknown): ChatTurn[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TURNS) {
    throw new BadRequestException('Send between 1 and 16 messages');
  }
  const turns = input.map((item) => {
    if (!item || typeof item !== 'object') throw new BadRequestException('Invalid message');
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if (role !== 'user' && role !== 'anchor') throw new BadRequestException('Invalid message role');
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
      throw new BadRequestException('Each message needs text under 2000 characters');
    }
    return { role, text: text.trim() } satisfies ChatTurn;
  });
  if (turns.at(-1)?.role !== 'user') throw new BadRequestException('The latest message must be from you');
  return turns;
}

export function memoryCatalog(moments: Moment[]): ChatMemory[] {
  return moments.slice(0, 40).map((moment) => ({
    id: moment.id,
    who: cut(moment.who, 80),
    what: cut(moment.what, 180),
    when: cut(moment.when, 80),
    memory: cut(moment.memory, 180),
    caption: cut(moment.caption, 180),
  }));
}

export function citeIds(requested: unknown, allowed: ReadonlySet<string>, limit = 5): string[] {
  const seen = new Set<string>();
  const cited: string[] = [];
  for (const id of valid.strings(requested)) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    cited.push(id);
    if (cited.length >= limit) break;
  }
  return cited;
}

export function chatPrompt(turns: ChatTurn[], memories: ChatMemory[], files: ChatFileRef[], filesNote: string): string {
  const memoryBlock = memories.length
    ? memories
        .map((item) => `- ${item.id}: ${item.who} — ${item.what} (${item.when}). Memory: ${item.memory}. Caption: ${item.caption}`)
        .join('\n')
    : '(none saved)';
  const fileBlock = filesNote
    ? filesNote
    : files.length
      ? files.map((item) => `- ${item.id}: ${item.name} (${item.contentType}, ${item.size} bytes)`).join('\n')
      : '(none uploaded)';
  const dialogue = turns.map((turn) => `${turn.role === 'user' ? 'Person' : 'Anchor'}: ${turn.text}`).join('\n');
  return (
    `You are Anchor, talking with a signed-in family member on the website so they can check saved memories and files.\n` +
    `Use only the lists below. Never invent an id, a memory, or a file.\n` +
    `When a memory answers the latest question, put its id in momentIds. When they ask to find or open a file, put its id in fileIds.\n` +
    `Leave an array empty when nothing matches. Reply in short, warm English.\n\n` +
    `Memories:\n${memoryBlock}\n\nFiles:\n${fileBlock}\n\nConversation:\n${dialogue}`
  );
}
