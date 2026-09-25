import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ask, speak } from './gemini';
import { familyMessage, LINES, MARIA, nextGap, rate, Rating } from './protocol';
import { song } from './song';
import { callMaria, listen, play, say, sendWhatsApp, twiml } from './twilio';

type News = {
  transcript: string;
  who: string;
  what: string;
  when: string;
  question: string;
  answer: string;
  hint: string;
  praise: string;
  reveal: string;
  memory: string;
  ack: string;
};
type Line = { from: 'sofia' | 'anchor' | 'maria'; text: string; audio?: string };
type Clip = { data: Buffer; mimeType: string };
type Turn = { song: boolean; lines: string[]; next?: 'story' | 'today' };

const text = { type: 'string' };
const NEWS_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { ...text, description: 'What the family member said, verbatim, in Greek' },
    who: { ...text, description: 'Who the news is about, in Greek' },
    what: { ...text, description: 'What happens, in Greek' },
    when: { ...text, description: 'When it happens, in Greek' },
    question: {
      ...text,
      description:
        'One short spoken question in Greek that links the news to Maria\'s wedding story and asks her to recall the key fact without revealing it. Example: «Τον Ιούνιο παντρεύεται κάποια άλλη σε εκείνη την εκκλησία. Ποια είναι;»',
    },
    answer: { ...text, description: 'The fact Maria should recall, in Greek. Example: «Η Άννα, η εγγονή της»' },
    hint: { ...text, description: 'One gentle spoken cue in Greek that does not say the answer, then the question again' },
    praise: { ...text, description: 'A warm spoken reply in Greek for when she remembers, naming the answer. Example: «Ναι, η Άννα! Θα χαρεί που το θυμάσαι.»' },
    reveal: { ...text, description: 'A warm spoken reply in Greek that tells her the answer without any sense of correction or failure' },
    memory: { ...text, description: 'The accusative Greek phrase for the family message «…και θυμήθηκε X». Example: «τον γάμο της Άννας»' },
    ack: { ...text, description: 'A short WhatsApp reply in Greek to the family member confirming Anchor will talk about it with Maria this week' },
  },
  required: ['transcript', 'who', 'what', 'when', 'question', 'answer', 'hint', 'praise', 'reveal', 'memory', 'ack'],
};

@Injectable()
export class AnchorService implements OnModuleInit {
  private readonly logger = new Logger(AnchorService.name);
  private readonly audio = new Map<string, Clip>([['song', { data: song(), mimeType: 'audio/wav' }]]);
  private readonly spoken = new Map<string, string>();
  private familyNumber?: string;
  private news?: News;
  private family: Line[] = [];
  private call = { status: 'idle', lines: [] as Line[], hinted: false, storyTold: false, storyElements: [] as string[], rating: undefined as Rating | undefined };
  private schedule = { gapDays: 1, nextCall: undefined as string | undefined };

  onModuleInit() {
    Object.values(LINES).forEach((line) => void this.prepare(line));
  }

  state() {
    return { news: this.news, family: this.family, call: this.call, schedule: this.schedule, story: MARIA.story, whatsapp: Boolean(this.familyNumber) };
  }

  audioFile(id: string) {
    return this.audio.get(id);
  }

  // ponytail: WAV embedded as base64, a few MB per call; transcode to AAC if the file gets too big to share
  demo() {
    const embed = (id?: string) => {
      const clip = id ? this.audio.get(id) : undefined;
      return clip ? `data:${clip.mimeType};base64,${clip.data.toString('base64')}` : undefined;
    };
    const sofia = this.family.map((line) => line.from).lastIndexOf('sofia');
    return {
      news: this.news,
      story: MARIA.story,
      schedule: this.schedule,
      rating: this.call.rating,
      storyElements: this.call.storyElements,
      family: this.family.slice(sofia, sofia + 2),
      moment: this.call.rating ? this.family.at(-1) : undefined,
      lines: this.call.lines.map((line) => ({ ...line, audio: embed(line.audio ?? this.spoken.get(line.text)) })),
    };
  }

  async addNews(input: { text?: string; audio?: { data: Buffer; mimeType: string } }, from?: string) {
    if (from) this.familyNumber = from;
    const line: Line = { from: 'sofia', text: input.text ?? '🎤 …' };
    this.family.push(line);
    const news = await ask<News>(
      `You write for Anchor, an automated phone companion that practises present-day memories with Maria through her own life stories.\n` +
        `${MARIA.context}\nHer story anchor: ${MARIA.story.summary}\n` +
        `A family member sent this news${input.audio ? ' as the attached voice note' : `: «${input.text}»`}. ` +
        `Extract the item and write the lines Anchor speaks to Maria. Use simple, warm, spoken Greek, one short sentence each.`,
      NEWS_SCHEMA,
      { audio: input.audio },
    );
    if (input.audio) line.text = `🎤 ${news.transcript}`;
    this.news = news;
    this.family.push({ from: 'anchor', text: news.ack });
    [news.question, news.hint, news.praise, news.reveal].forEach((spoken) => void this.prepare(spoken));
    return news.ack;
  }

  async startCall(baseUrl: string) {
    this.resetCall('calling');
    await callMaria(baseUrl);
  }

  ring() {
    this.resetCall('ringing');
  }

  callStatus(status: string) {
    this.call.status = { queued: 'calling', initiated: 'calling', 'in-progress': 'in-call', completed: 'ended' }[status] ?? status;
  }

  async transcribe(audio: Buffer, mimeType: string) {
    const result = await ask<{ transcript: string }>(
      'Transcribe this Greek spoken answer verbatim, in Greek. Return an empty string when nobody speaks.',
      { type: 'object', properties: { transcript: { type: 'string' } }, required: ['transcript'] },
      { audio: { data: audio, mimeType }, fast: true, timeoutMs: 30000 },
    );
    return result.transcript.trim();
  }

  async step(step: string, speech: string, recording?: Clip): Promise<Turn> {
    const news = this.news;
    if (speech) {
      const id = recording ? randomUUID() : undefined;
      if (id && recording) this.audio.set(id, recording);
      this.call.lines.push({ from: 'maria', text: speech, audio: id });
    }

    if (step === 'start') {
      this.call.status = 'in-call';
      this.call.lines.push({ from: 'anchor', text: `♪ Συννεφιασμένη Κυριακή`, audio: 'song' });
      return this.turn([LINES.greeting], 'story', true);
    }

    if (step === 'story') {
      this.call.storyTold = speech.length > 0;
      void this.scoreStory(speech);
      if (!news) return this.goodbye();
      return this.turn([LINES.bridge, news.question], 'today');
    }

    if (!news) return this.goodbye();
    const recalled = await this.recalled(news, speech);
    if (!recalled && !this.call.hinted) {
      this.call.hinted = true;
      return this.turn([news.hint], 'today');
    }
    this.finish(news, rate(recalled ? 1 : 0, 1, this.call.hinted));
    return this.goodbye(recalled ? news.praise : news.reveal);
  }

  toTwiml({ song, lines, next }: Turn) {
    const spoken = lines.map((line) => this.voice(line)).join('');
    return twiml(song ? play('/audio/song.wav') : '', next ? listen(`/voice/${next}`, spoken) : `${spoken}<Hangup/>`);
  }

  browserTurn({ song, lines, next }: Turn) {
    const audio = (line: string) => (this.spoken.has(line) ? `audio/${this.spoken.get(line)}.wav` : undefined);
    return { song: song ? 'audio/song.wav' : undefined, lines: lines.map((line) => ({ text: line, audio: audio(line) })), next };
  }

  private resetCall(status: string) {
    this.call = { status, lines: [], hinted: false, storyTold: false, storyElements: [], rating: undefined };
  }

  private turn(lines: string[], next?: Turn['next'], song = false): Turn {
    lines.forEach((text) => this.call.lines.push({ from: 'anchor', text }));
    if (!next) this.call.status = 'ended';
    return { song, lines, next };
  }

  private goodbye(closing?: string) {
    return this.turn(closing ? [closing, LINES.goodbye] : [LINES.goodbye]);
  }

  private finish(news: News, rating: Rating) {
    this.call.rating = rating;
    this.schedule.gapDays = nextGap(this.schedule.gapDays, rating);
    const next = new Date();
    next.setDate(next.getDate() + this.schedule.gapDays);
    next.setHours(11, 0, 0, 0);
    this.schedule.nextCall = next.toISOString();
    const message = familyMessage(this.call.storyTold, rating, news.memory);
    this.family.push({ from: 'anchor', text: message });
    if (this.familyNumber) sendWhatsApp(this.familyNumber, message).catch((error) => this.logger.error(error));
  }

  private async recalled(news: News, speech: string) {
    if (!speech) return false;
    try {
      const result = await ask<{ recalled: boolean }>(
        `Anchor asked Maria: «${news.question}». The fact to recall: «${news.answer}». ` +
          `Phone speech recognition heard her answer: «${speech}». It may contain recognition errors. Did she recall the fact?`,
        { type: 'object', properties: { recalled: { type: 'boolean' } }, required: ['recalled'] },
        { fast: true },
      );
      return result.recalled;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  private async scoreStory(speech: string) {
    if (!speech) return;
    try {
      const result = await ask<{ recalled: string[] }>(
        `Maria told her wedding story on the phone. Speech recognition heard: «${speech}». ` +
          `Which of these story elements did she mention, even in other words? ${JSON.stringify(MARIA.story.elements)}. Return the exact labels.`,
        { type: 'object', properties: { recalled: { type: 'array', items: { type: 'string', enum: MARIA.story.elements } } }, required: ['recalled'] },
      );
      this.call.storyElements = result.recalled;
    } catch (error) {
      this.logger.error(error);
    }
  }

  private voice(text: string) {
    const id = this.spoken.get(text);
    return id ? play(`/audio/${id}.wav`) : say(text);
  }

  private async prepare(text: string) {
    if (this.spoken.has(text)) return;
    try {
      const id = randomUUID();
      this.audio.set(id, { data: await speak(text), mimeType: 'audio/wav' });
      this.spoken.set(text, id);
    } catch (error) {
      this.logger.warn(`Gemini TTS failed, the call falls back to <Say>: ${error}`);
    }
  }
}
