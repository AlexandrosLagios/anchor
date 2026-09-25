import { Logger } from '@nestjs/common';
import { lines } from '../core/lines';
import type { Feature, Moment } from '../core/types';
import * as gemini from '../gemini';

const logger = new Logger('Ask');

const QUESTION = /^anchor\b[,:]?\s+/i;

function momentDate(moment: Moment) {
  return moment.eventDate ? new Date(`${moment.eventDate}T12:00`) : new Date(moment.savedAt);
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function choiceLine(moment: Moment) {
  const stories = moment.stories.map((story) => story.text.slice(0, 200)).join(' | ');
  const people = moment.people.join(', ');
  return `- id ${moment.id}: "${moment.title}", ${formatDate(momentDate(moment))}, people: ${people}, stories: ${stories}`;
}

function buildPrompt(question: string, choices: Moment[], hasVoice: boolean) {
  return (
    "You are Anchor, the keeper of this family's record. A family member asked a question about a moment from the family record" +
    `${hasVoice ? ', also attached here as a voice note' : ''}: "${question}"\n` +
    'Pick the id of the moment that answers the question from this list, or "none" when nothing fits.\n' +
    choices.map(choiceLine).join('\n')
  );
}

export const ask: Feature = {
  name: 'ask',
  async handle(event, family, ctx) {
    if (event.chat !== 'group' || !family) return false;
    const text = event.text ?? '';
    const match = QUESTION.exec(text);
    if (!match) return false;
    const question = text.slice(match[0].length);

    const choices = family.moments.filter((moment) => !moment.sensitive);
    if (!choices.length) {
      await ctx.transport(family.id).send(event.chatId, { text: lines.notFound });
      return true;
    }

    const choiceIds = choices.map((moment) => moment.id);
    const schema = { type: 'object', properties: { momentId: { type: 'string', enum: [...choiceIds, 'none'] } }, required: ['momentId'] };

    let momentId: string | undefined;
    try {
      const clip = event.voice ? await ctx.transport(family.id).download(event.voice) : undefined;
      const options: { media?: { data: Buffer; mimeType: string }[] } = clip ? { media: [clip] } : {};
      const answer = await gemini.ask<{ momentId: string }>(buildPrompt(question, choices, !!event.voice), schema, options);
      momentId = gemini.valid.oneOf(answer.momentId, choiceIds);
    } catch (error) {
      logger.warn(`ask failed: ${error}`);
    }

    const moment = momentId ? family.moments.find((candidate) => candidate.id === momentId) : undefined;
    if (!moment || moment.sensitive) {
      await ctx.transport(family.id).send(event.chatId, { text: lines.notFound });
      return true;
    }

    const names = [...new Set(moment.stories.map((story) => story.by.name))];
    await ctx.transport(family.id).send(event.chatId, {
      ...(moment.video ? { video: moment.video } : moment.photo ? { photo: moment.photo } : {}),
      text: lines.askAnswer(moment.title, formatDate(momentDate(moment)), names),
      replyTo: event.messageId,
    });

    const voiceStory = moment.stories.find((story) => story.voice);
    if (voiceStory) await ctx.transport(family.id).send(event.chatId, { voice: voiceStory.voice });

    return true;
  },
};
