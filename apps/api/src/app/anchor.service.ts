import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ask, speak } from './gemini';
import { ATHINA, familyNote, nextGap, rate, Rating, scheduleNext } from './protocol';
import { sendWhatsApp } from './twilio';
import { UserStoreService } from './user-store.service';

export type Role = 'sofia' | 'maria' | 'athina' | 'anchor';

export type ChatLine = {
  id: string;
  from: Role;
  text: string;
  mediaUrl?: string;
  at: string;
};

export type Moment = {
  id: string;
  caption: string;
  sender: Role;
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
  mediaUrl?: string;
  mediaType?: string;
  createdAt: string;
  gapDays: number;
  nextDue: string;
  rating?: Rating;
  cued: boolean;
  phase: 'idle' | 'awaiting' | 'hinted';
};

type Clip = { data: Buffer; mimeType: string };

type Session = {
  familyNumber?: string;
  chat: ChatLine[];
  moments: Moment[];
  activeId?: string;
  hydrated: boolean;
};

const DEMO = 'demo';
const WHATSAPP = 'whatsapp';

type Extracted = {
  caption: string;
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

const text = { type: 'string' };
const MOMENT_SCHEMA = {
  type: 'object',
  properties: {
    caption: { ...text, description: 'A short English caption for the moment, verbatim if text was given' },
    who: { ...text, description: 'Who the moment is about, in English' },
    what: { ...text, description: 'What happens, in English' },
    when: { ...text, description: 'When it happens or happened, in English' },
    question: {
      ...text,
      description:
        'One short spoken question in English that brings the moment back without revealing the key fact. Example: "Do you remember whose first day of school this was?"',
    },
    answer: { ...text, description: 'The fact Athina should recall, in English. Example: "Maria, Sofia\'s daughter"' },
    hint: {
      ...text,
      description: 'One gentle cue in English that does not say the answer, then the question again',
    },
    praise: {
      ...text,
      description: 'A warm reply in English when she remembers, naming the answer',
    },
    reveal: {
      ...text,
      description: 'A warm reply in English that tells her the answer with no sense of correction or failure',
    },
    memory: {
      ...text,
      description: 'A short English phrase for the family note "Athina remembered X". Example: "Maria\'s first day of school"',
    },
    ack: {
      ...text,
      description: 'A short WhatsApp reply in English confirming Anchor saved the moment and will bring it back to Athina',
    },
  },
  required: ['caption', 'who', 'what', 'when', 'question', 'answer', 'hint', 'praise', 'reveal', 'memory', 'ack'],
};

@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);
  private readonly audio = new Map<string, Clip>();
  private readonly media = new Map<string, Clip>();
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly store: UserStoreService) {}

  static ownerFor(uid?: string | null) {
    return uid || DEMO;
  }

  static whatsappOwner() {
    return WHATSAPP;
  }

  async ensure(owner: string): Promise<Session> {
    let session = this.sessions.get(owner);
    if (!session) {
      session = { chat: [], moments: [], hydrated: false };
      this.sessions.set(owner, session);
    }
    if (!session.hydrated && owner !== DEMO && owner !== WHATSAPP) {
      const snap = await this.store.loadSnapshot(owner);
      if (snap) {
        session.chat = snap.chat;
        session.moments = snap.moments;
        session.activeId = snap.activeId;
      }
      session.hydrated = true;
    }
    return session;
  }

  state(owner: string) {
    const session = this.sessions.get(owner) ?? { chat: [], moments: [], hydrated: true };
    return {
      chat: session.chat,
      moments: session.moments,
      activeId: session.activeId,
      due: this.dueMoments(session),
      whatsapp: Boolean(session.familyNumber),
      person: ATHINA,
    };
  }

  audioFile(id: string) {
    return this.audio.get(id) ?? this.media.get(id);
  }

  demo(owner: string) {
    const session = this.sessions.get(owner) ?? { chat: [], moments: [], hydrated: true };
    const embed = (url?: string) => {
      if (!url?.includes('media/') && !url?.includes('audio/')) return url;
      const id = url.replace(/\.(wav|bin)$/, '').replace(/^\/?(api\/)?(media|audio)\//, '');
      const clip = this.audio.get(id) ?? this.media.get(id);
      return clip ? `data:${clip.mimeType};base64,${clip.data.toString('base64')}` : undefined;
    };
    return {
      chat: session.chat.map((line) => ({ ...line, mediaUrl: embed(line.mediaUrl) })),
      moments: session.moments,
      person: ATHINA,
    };
  }

  async addMoment(
    owner: string,
    input: { text?: string; audio?: { data: Buffer; mimeType: string }; image?: { data: Buffer; mimeType: string }; from?: Role },
    whatsappFrom?: string,
  ) {
    const session = await this.ensure(owner);
    if (whatsappFrom) session.familyNumber = whatsappFrom;
    const sender = input.from ?? 'sofia';
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (input.image) {
      const id = randomUUID();
      this.media.set(id, input.image);
      mediaUrl = `/api/media/${id}.bin`;
      mediaType = input.image.mimeType;
    } else if (input.audio) {
      const id = randomUUID();
      this.media.set(id, input.audio);
      mediaUrl = `/api/media/${id}.bin`;
      mediaType = input.audio.mimeType;
    }

    const placeholder = input.text?.trim() || (input.audio ? '🎤 voice note' : input.image ? '📷 photo' : '…');
    this.push(session, sender, placeholder, mediaUrl);

    const extracted = await ask<Extracted>(
      `You write for Anchor, an AI member of a family WhatsApp group that practises present-day memories with Athina through spaced retrieval.\n` +
        `${ATHINA.context}\n` +
        `A family member just shared this moment${input.audio ? ' as a voice note' : input.image ? ' as a photo' : ''}` +
        `${input.text ? `: «${input.text}»` : '.'} ` +
        `Extract the moment and write the lines Anchor will use later. Use simple, warm, spoken English. One short sentence each.`,
      MOMENT_SCHEMA,
      { audio: input.audio },
    );

    const moment: Moment = {
      id: randomUUID(),
      caption: extracted.caption || placeholder,
      sender,
      who: extracted.who,
      what: extracted.what,
      when: extracted.when,
      question: extracted.question,
      answer: extracted.answer,
      hint: extracted.hint,
      praise: extracted.praise,
      reveal: extracted.reveal,
      memory: extracted.memory,
      ack: extracted.ack,
      mediaUrl,
      mediaType,
      createdAt: new Date().toISOString(),
      gapDays: 1,
      nextDue: scheduleNext(1),
      cued: false,
      phase: 'idle',
    };
    session.moments.unshift(moment);
    this.push(session, 'anchor', moment.ack);
    void this.prepare(moment.question);
    void this.prepare(moment.hint);
    void this.prepare(moment.praise);
    void this.prepare(moment.reveal);
    return moment.ack;
  }

  /** Starts a re-encounter for the next due moment (or a chosen id). */
  async bringBack(owner: string, momentId?: string) {
    const session = await this.ensure(owner);
    const moment =
      (momentId ? session.moments.find((item) => item.id === momentId) : undefined) ??
      this.dueMoments(session)[0] ??
      session.moments.find((item) => item.phase === 'idle');
    if (!moment) return { ok: false as const, reason: 'No moment ready to bring back' };
    if (moment.phase === 'awaiting' || moment.phase === 'hinted') {
      return { ok: false as const, reason: "Already waiting for Athina's reply" };
    }

    session.activeId = moment.id;
    moment.phase = 'awaiting';
    moment.cued = false;
    this.push(session, 'anchor', moment.question, moment.mediaUrl);

    if (session.familyNumber) {
      await sendWhatsApp(session.familyNumber, moment.question).catch((error) => this.logger.error(error));
    }
    return { ok: true as const, momentId: moment.id, question: moment.question };
  }

  async replyAsAthina(owner: string, input: { text?: string; audio?: { data: Buffer; mimeType: string } }) {
    const session = await this.ensure(owner);
    const moment = session.moments.find((item) => item.id === session.activeId);
    if (!moment || (moment.phase !== 'awaiting' && moment.phase !== 'hinted')) {
      return { ok: false as const, reason: 'Nothing is waiting for a reply' };
    }

    let speech = input.text?.trim() ?? '';
    let mediaUrl: string | undefined;
    if (input.audio) {
      const id = randomUUID();
      this.media.set(id, input.audio);
      mediaUrl = `/api/media/${id}.bin`;
      speech = await this.transcribe(input.audio.data, input.audio.mimeType);
    }
    this.push(session, 'athina', speech || '…', mediaUrl);

    const recalled = await this.recalled(moment, speech);
    if (!recalled && moment.phase === 'awaiting') {
      moment.phase = 'hinted';
      moment.cued = true;
      this.push(session, 'anchor', moment.hint);
      if (session.familyNumber) sendWhatsApp(session.familyNumber, moment.hint).catch((error) => this.logger.error(error));
      return { ok: true as const, outcome: 'cued' as const };
    }

    const rating = rate(recalled ? 1 : 0, 1, moment.cued);
    const closing = recalled ? moment.praise : moment.reveal;
    this.push(session, 'anchor', closing);
    this.finish(session, moment, rating);
    if (session.familyNumber) sendWhatsApp(session.familyNumber, closing).catch((error) => this.logger.error(error));
    return { ok: true as const, outcome: rating };
  }

  async transcribe(audio: Buffer, mimeType: string) {
    const result = await ask<{ transcript: string }>(
      'Transcribe this spoken English answer verbatim. Return an empty string when nobody speaks.',
      { type: 'object', properties: { transcript: { type: 'string' } }, required: ['transcript'] },
      { audio: { data: audio, mimeType }, fast: true, timeoutMs: 30000 },
    );
    return result.transcript.trim();
  }

  private dueMoments(session: Session) {
    const now = Date.now();
    return session.moments.filter(
      (moment) => moment.phase === 'idle' && new Date(moment.nextDue).getTime() <= now,
    );
  }

  private finish(session: Session, moment: Moment, rating: Rating) {
    moment.rating = rating;
    moment.gapDays = nextGap(moment.gapDays, rating);
    moment.nextDue = scheduleNext(moment.gapDays);
    moment.phase = 'idle';
    session.activeId = undefined;
    const note = familyNote(rating, moment.memory);
    if (note) {
      this.push(session, 'anchor', note);
      if (session.familyNumber) sendWhatsApp(session.familyNumber, note).catch((error) => this.logger.error(error));
    }
  }

  private async recalled(moment: Moment, speech: string) {
    if (!speech) return false;
    try {
      const result = await ask<{ recalled: boolean }>(
        `Anchor asked Athina: «${moment.question}». The fact to recall: «${moment.answer}». ` +
          `She answered: «${speech}». Speech may contain recognition errors. Did she recall the fact?`,
        { type: 'object', properties: { recalled: { type: 'boolean' } }, required: ['recalled'] },
        { fast: true },
      );
      return result.recalled;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  private push(session: Session, from: Role, text: string, mediaUrl?: string) {
    session.chat.push({ id: randomUUID(), from, text, mediaUrl, at: new Date().toISOString() });
  }

  private async prepare(text: string) {
    try {
      const id = randomUUID();
      this.audio.set(id, { data: await speak(text), mimeType: 'audio/wav' });
    } catch (error) {
      this.logger.warn(`OpenAI TTS failed: ${error}`);
    }
  }
}
