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
  tags: string[];
  transcript: string;
  description?: string; // Anchor's own sentence about the photo or the video frame, for a member who cannot see it well
};

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    salience: { type: 'integer' },
    people: { type: 'array', items: { type: 'string' } },
    eventDate: { type: 'string' },
    title: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    transcript: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['verdict', 'salience', 'people', 'eventDate', 'title', 'tags', 'transcript', 'description'],
};

// each tag once, whatever the case
const unique = (tags: string[]) => tags.filter((tag, index) => tags.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === index);

// a description names nobody and judges nothing, so a family name or a judgment word drops it
const JUDGMENTS = new Set(['beautiful', 'lovely', 'cute', 'happy', 'special']);
function plainDescription(description: string, names: string[]): boolean {
  const named = new Set(names.flatMap((name) => name.split(/\s+/)).filter((word) => word.length > 2));
  return (description.match(/[\p{L}\p{M}-]+/gu) ?? []).every((word) => !named.has(word) && !JUDGMENTS.has(word.toLowerCase()));
}

const tagsOf = (raw: unknown) => unique(valid.strings(raw).map((tag) => cut(tag.trim(), 40)).filter(Boolean)).slice(0, 5);

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
    tags: tagsOf(record.tags),
    transcript: valid.text(record.transcript),
    description: valid.text(record.description, 300) || undefined,
  };
}

type Picture = 'photo' | 'video';

function prompt(bundle: Bundle, picture: Picture | undefined): string {
  // ponytail: every tag of the family goes into the prompt; keep the most used ones when a record reaches thousands of tags
  const tags = unique(bundle.family.moments.flatMap((moment) => moment.tags ?? []));
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
    '- small_talk: chatter, jokes, reactions, arguments, and questions or requests to Anchor, such as "a memory of Lucy?".',
    '',
    'Return: verdict; salience from 1 to 5; people, the names in the moment; eventDate as YYYY-MM-DD, or empty when unknown; ' +
      'title, a short phrase for the family record, at most 100 characters; tags, up to 5 short tags for what the moment is about: ' +
      'the names of people and pets, places, events, and activities, for example ["Lucy", "dog", "park"], never generic words such as family, photo, or happy; ' +
      'transcript, the words spoken in the voice note, or empty; ' +
      (picture
        ? `and description, one plain sentence of at most 30 words that starts with "The ${picture} shows" and says what is visible: ` +
          `the people, the animals, the place, the colours, and what happens, for example ` +
          `"The ${picture} shows a girl with a red backpack holding a woman's hand at a school gate, with other children behind them."`
        : 'and description, empty.'),
    ...(picture
      ? [
          'The description is for a family member who cannot see the picture well, so it says only what the picture shows. ' +
            'The description never names a person or a pet, even when the words name one: it says "a girl" or "a small dog" instead. The title and the tags still use the names. ' +
            'The description never guesses an age, a feeling, or a relation, and never judges the picture with words such as beautiful, lovely, cute, happy, or special.',
        ]
      : []),
    ...(tags.length ? [`Tags the family already uses: ${tags.join('; ')}. Reuse a tag word for word when it means the same thing.`] : []),
  ].join('\n');
}

export async function classify(bundle: Bundle, transport: Transport): Promise<Classification | undefined> {
  const photoEvent = bundle.events.find((event) => event.photo);
  const videoEvent = !photoEvent && bundle.events.find((event) => event.video && event.thumbnail);
  const voiceEvent = bundle.events.find((event) => event.voice);

  const picture = photoEvent?.photo ?? (videoEvent ? videoEvent.thumbnail : undefined);
  const media = await Promise.all([picture, voiceEvent?.voice].filter(Boolean).map((item) => transport.download(item)));

  const kind: Picture | undefined = photoEvent ? 'photo' : videoEvent ? 'video' : undefined;
  const result = validate(await ask<unknown>(prompt(bundle, kind), SCHEMA, { media }));
  // a description needs a picture that the model saw, and it reads as Anchor's words only when it opens with the picture words
  if (result?.description && !(kind && result.description.startsWith(`The ${kind} shows `))) result.description = undefined;
  const names = [bundle.sender.name, ...bundle.family.members.map((member) => member.name), ...bundle.family.moments.flatMap((moment) => moment.people), ...(result?.people ?? [])];
  if (result?.description && !plainDescription(result.description, names)) result.description = undefined;
  return result;
}
