import { Logger } from '@nestjs/common';
import type { Feature } from '../core/types';
import { transcribe } from '../model/model';

const logger = new Logger('Transcripts');

// a voice note carries its transcript as its text, so every feature reads a spoken "Anchor, show us a memory" as it reads the typed one
// ponytail: every group voice note costs one transcription, and the poll waits for it; skip plain family talk when the cost or the wait hurts
export const transcripts: Feature = {
  name: 'transcripts',
  async handle(event, family, ctx) {
    if (!family || !event.voice || event.text) return false;
    try {
      event.text = (await transcribe(await ctx.transport(family.id).download(event.voice))) || undefined;
    } catch (error) {
      logger.warn(`The voice note download failed: ${error}`);
    }
    return false;
  },
};
