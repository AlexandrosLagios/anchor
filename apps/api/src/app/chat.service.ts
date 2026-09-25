import { Injectable } from '@nestjs/common';
import { AnchorService } from './anchor.service';
import { chatPrompt, citeIds, memoryCatalog, normalizeTurns, type ChatFileRef, type ChatMemory } from './chat';
import { FilesService, type UserFile } from './files.service';
import { ask, valid } from './gemini';

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'A short warm reply in English, grounded only in the listed memories and files' },
    momentIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ids of memories that answer the latest question. Empty when none match.',
    },
    fileIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Ids of files the person asked to find or open. Empty when none match.',
    },
  },
  required: ['reply', 'momentIds', 'fileIds'],
};

export type ChatResponse = {
  reply: string;
  moments: ChatMemory[];
  files: ChatFileRef[];
};

@Injectable()
export class ChatService {
  constructor(
    private readonly anchor: AnchorService,
    private readonly files: FilesService,
  ) {}

  async reply(userId: string, messages: unknown): Promise<ChatResponse> {
    const turns = normalizeTurns(messages);
    await this.anchor.ensure(userId);
    const moments = this.anchor.state(userId).moments;
    const memories = memoryCatalog(moments);
    const stored = this.files.configured() ? await this.files.list(userId) : [];
    const filesNote = this.files.configured() ? '' : 'File storage is not configured, so there are no files to retrieve.';
    const catalog = stored.map(fileRef);
    const answer = await ask<{ reply?: unknown; momentIds?: unknown; fileIds?: unknown }>(
      chatPrompt(turns, memories, catalog, filesNote),
      CHAT_SCHEMA,
      { fast: true, timeoutMs: 20000 },
    );
    const momentIds = new Set(citeIds(answer.momentIds, new Set(memories.map((item) => item.id))));
    const fileIds = new Set(citeIds(answer.fileIds, new Set(catalog.map((item) => item.id))));
    const reply = valid.text(answer.reply, 1200) || 'I could not answer that from what is saved.';
    return {
      reply,
      moments: memories.filter((item) => momentIds.has(item.id)),
      files: catalog.filter((item) => fileIds.has(item.id)),
    };
  }
}

function fileRef(file: UserFile): ChatFileRef {
  return {
    id: file.id,
    name: file.originalName || 'upload',
    contentType: file.contentType,
    size: file.size,
  };
}
