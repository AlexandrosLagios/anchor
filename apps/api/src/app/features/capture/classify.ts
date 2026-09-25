import { cut } from '../../core/lines';
import type { Transport } from '../../core/types';
import { ask, valid } from '../../model/model';
import type { Bundle } from './filter';
import { typedText } from './filter';

const VERDICTS = ['family_moment', 'sensitive', 'logistics', 'small_talk'] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Classification = {
  verdict: Verdict;
  salience: number;
  people: string[];
  eventDate?: string;
  title: string;
  transcript: string;
};

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    salience: { type: 'integer' },
    people: { type: 'array', items: { type: 'string' } },
    eventDate: { type: 'string' },
    title: { type: 'string' },
    transcript: { type: 'string' },
  },
  required: ['verdict', 'salience', 'people', 'eventDate', 'title', 'transcript'],
};

export function validate(raw: unknown): Classification | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const verdict = valid.oneOf(record.verdict, VERDICTS);
  if (!verdict) return undefined;
  const title = cut(valid.text(record.title), 100);
  if ((verdict === 'family_moment' || verdict === 'sensitive') && !title) return undefined;
  return {
    verdict,
    salience: valid.int(record.salience, 1, 5) ?? 3,
    people: valid.strings(record.people),
    eventDate: valid.date(record.eventDate),
    title,
    transcript: valid.text(record.transcript),
  };
}

function prompt(bundle: Bundle): string {
  return [
    "Anchor keeps the family's shared photos and stories, and quotes each moment in the words of the person who shared it. Anchor is never a person.",
    `${bundle.sender.name} shared this in the family chat:`,
    typedText(bundle) || '(no typed words)',
    '',
    'The moment may have no words. Then classify it and give it a title from the photo or the video frame.',
    'The title names what the moment shows, never the sharer, and never starts with "Photo of" or "A photo of", for example "Mapo tofu at home".',
    'Classify it as one of these verdicts:',
    '- family_moment: a moment worth keeping.',
    '- sensitive: a moment worth keeping that can hurt to see again, such as a loss, grief, or illness.',
    '- logistics: plans, errands, and money.',
    '- small_talk: chatter, jokes, reactions, and arguments.',
    '',
    'Return: verdict; salience from 1 to 5; people, the names in the moment; eventDate as YYYY-MM-DD, or empty when unknown; ' +
      'title, a short phrase for the family record, at most 100 characters; and transcript, the words spoken in the voice note, or empty.',
  ].join('\n');
}

export async function classify(bundle: Bundle, transport: Transport): Promise<Classification | undefined> {
  const photoEvent = bundle.events.find((event) => event.photo);
  const videoEvent = !photoEvent && bundle.events.find((event) => event.video && event.thumbnail);
  const voiceEvent = bundle.events.find((event) => event.voice);

  const picture = photoEvent?.photo ?? (videoEvent ? videoEvent.thumbnail : undefined);
  const media = await Promise.all([picture, voiceEvent?.voice].filter(Boolean).map((item) => transport.download(item)));

  const raw = await ask<unknown>(prompt(bundle), SCHEMA, { media });
  return validate(raw);
}
