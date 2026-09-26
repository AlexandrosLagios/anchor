// Bridges a Twilio Media Stream to an OpenAI Realtime session. Both sides speak G.711 μ-law at 8 kHz, so audio passes through untouched.

const BYTES_PER_MS = 8;
const SHARE = ['voice', 'words', 'no'] as const;

export type Share = (typeof SHARE)[number];

export type TwilioEvent =
  | { event: 'start'; start: { streamSid: string; callSid: string; customParameters?: Record<string, string> } }
  | { event: 'media'; media: { payload: string; timestamp: string } }
  | { event: 'mark'; mark: { name: string } }
  | { event: 'connected' | 'stop' | 'dtmf' };

export interface RealtimeEvent {
  type: string;
  delta?: string;
  item_id?: string;
  transcript?: string;
  audio_start_ms?: number;
  audio_end_ms?: number;
  response?: { output?: { type: string; name?: string; arguments?: string }[]; usage?: unknown };
}

export interface CallRecord {
  callSid?: string;
  share?: Share;
  tellSender?: boolean;
  connect?: boolean;
  dialed?: boolean; // the live call moved to the sharer's phone
  shareAsked?: { ms: number; line: number };
  audio: Buffer[];
  speech: [number, number][];
  transcript: { speaker: 'anchor' | 'person'; text: string }[];
  latencies: number[];
  usage: unknown[];
}

export interface BridgeOptions {
  toTwilio: (event: object) => void;
  toRealtime: (event: object) => void;
  hangUp: () => void;
  instructions: string;
  opener: string;
  askShare?: string;
  goodbye?: string;
  voice?: string;
  now?: () => number;
}

export function bridge({ toTwilio, toRealtime, hangUp, instructions, opener, askShare, goodbye, voice = 'marin', now = Date.now }: BridgeOptions) {
  const record: CallRecord = { audio: [], speech: [], transcript: [], latencies: [], usage: [] };
  let streamSid: string | undefined;
  let realtimeOpen = false;
  let begun = false;
  let openerDone = false;
  let listening = false;
  let heardMs = 0;
  let latestTimestamp = 0;
  let pendingMarks = 0;
  let playing: { item: string; start: number } | undefined;
  let speechStart = 0;
  let speechEndedAt: number | undefined;
  let spoke = false;
  let sayingGoodbye = false;

  function begin() {
    if (begun || !streamSid || !realtimeOpen) return;
    begun = true;
    toRealtime({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        instructions,
        reasoning: { effort: 'low' },
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            noise_reduction: { type: 'near_field' },
            transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
            turn_detection: { type: 'semantic_vad', eagerness: 'auto' },
          },
          output: { format: { type: 'audio/pcmu' }, voice },
        },
        tools: [
          {
            type: 'function',
            name: 'end_call',
            description: 'Hang up the phone. First say your thanks and goodbye out loud, then call it in the same turn.',
            parameters: {
              type: 'object',
              properties: {
                share: {
                  type: 'string',
                  enum: SHARE,
                  description: 'What the person agreed to share with the family: voice for their words in their own voice, words for their words only, no for nothing or no clear answer.',
                },
                tell_sender: { type: 'boolean', description: 'True when the person said yes to telling the sender that they would love a call.' },
                connect: { type: 'boolean', description: 'True when the person said yes to being connected to the sender now.' },
              },
              required: ['share', 'tell_sender'],
            },
          },
        ],
      },
    });
    toRealtime(say(opener));
  }

  function mark(name: string) {
    toTwilio({ event: 'mark', streamSid, mark: { name } });
    pendingMarks++;
  }

  return {
    record,

    open() {
      realtimeOpen = true;
      begin();
    },

    twilio(event: TwilioEvent) {
      switch (event.event) {
        case 'start':
          streamSid = event.start.streamSid;
          record.callSid = event.start.callSid;
          begin();
          break;
        case 'media': {
          latestTimestamp = Number(event.media.timestamp);
          if (!listening) break;
          const chunk = Buffer.from(event.media.payload, 'base64');
          record.audio.push(chunk);
          heardMs += chunk.length / BYTES_PER_MS;
          toRealtime({ type: 'input_audio_buffer.append', audio: event.media.payload });
          break;
        }
        case 'mark':
          pendingMarks = Math.max(0, pendingMarks - 1);
          if (event.mark.name === 'listen') listening = true;
          if (event.mark.name === 'hangup') hangUp();
          break;
      }
    },

    realtime(event: RealtimeEvent) {
      switch (event.type) {
        case 'response.output_audio.delta':
          if (!event.delta || !event.item_id) break;
          if (speechEndedAt !== undefined) {
            record.latencies.push(now() - speechEndedAt);
            speechEndedAt = undefined;
          }
          spoke = true;
          if (playing?.item !== event.item_id) playing = { item: event.item_id, start: latestTimestamp };
          toTwilio({ event: 'media', streamSid, media: { payload: event.delta } });
          mark('audio');
          break;
        case 'input_audio_buffer.speech_started':
          speechStart = event.audio_start_ms ?? heardMs;
          speechEndedAt = undefined;
          if (pendingMarks > 0 && playing) {
            toRealtime({ type: 'conversation.item.truncate', item_id: playing.item, content_index: 0, audio_end_ms: latestTimestamp - playing.start });
            toTwilio({ event: 'clear', streamSid });
            playing = undefined;
          }
          break;
        case 'input_audio_buffer.speech_stopped': {
          const end = event.audio_end_ms ?? heardMs;
          record.speech.push([speechStart, end]);
          speechEndedAt = now() - (heardMs - end);
          break;
        }
        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript?.trim()) record.transcript.push({ speaker: 'person', text: event.transcript.trim() });
          break;
        case 'response.output_audio_transcript.done':
          if (!event.transcript?.trim()) break;
          record.transcript.push({ speaker: 'anchor', text: event.transcript.trim() });
          if (askShare && !record.shareAsked && asksToShare(event.transcript, askShare)) {
            record.shareAsked = { ms: heardMs, line: record.transcript.length - 1 };
          }
          break;
        case 'error':
          if (!openerDone) hangUp();
          break;
        case 'response.done': {
          if (!openerDone) {
            openerDone = true;
            mark('listen');
          }
          if (event.response?.usage) record.usage.push(event.response.usage);
          const spokeInResponse = spoke;
          spoke = false;
          if (sayingGoodbye) {
            mark('hangup');
            break;
          }
          const endCall = event.response?.output?.find((item) => item.type === 'function_call' && item.name === 'end_call');
          if (!endCall) break;
          Object.assign(record, answersOf(endCall.arguments));
          if (spokeInResponse || !goodbye) {
            mark('hangup');
          } else {
            sayingGoodbye = true;
            toRealtime(say(goodbye));
          }
          break;
        }
      }
    },
  };
}

/** The caller's side of the call, cut to the stretches where the caller spoke before untilMs. */
export function speechOf(record: CallRecord, untilMs = Infinity): Buffer {
  const audio = Buffer.concat(record.audio);
  let covered = 0;
  return Buffer.concat(
    record.speech.map(([start, end]) => {
      const from = Math.max(start, covered);
      covered = Math.max(covered, end);
      return audio.subarray(from * BYTES_PER_MS, Math.min(end, untilMs) * BYTES_PER_MS);
    }),
  );
}

/** The member's words and voice before the share question, so the answer to the question never reaches the family. */
export function storyOf(record: CallRecord): { text: string; audio: Buffer } {
  const lines = record.shareAsked ? record.transcript.slice(0, record.shareAsked.line) : record.transcript;
  return {
    text: lines.filter((line) => line.speaker === 'person').map((line) => line.text).join(' '),
    audio: speechOf(record, record.shareAsked?.ms),
  };
}

const say = (line: string) => ({ type: 'response.create', response: { instructions: `Say exactly these words, and nothing else: ${line}` } });
const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 4);

// ponytail: a word-overlap match, because a model can paraphrase the fixed line; a scripted share turn replaces it when a follow-up reuses most of the words
function asksToShare(line: string, askShare: string) {
  const said = new Set(words(line));
  const key = words(askShare);
  return key.filter((word) => said.has(word)).length >= 0.6 * key.length;
}

function answersOf(args = '{}'): { share: Share; tellSender: boolean; connect: boolean } {
  try {
    const { share, tell_sender, connect } = JSON.parse(args);
    return { share: SHARE.includes(share) ? share : 'no', tellSender: tell_sender === true, connect: connect === true };
  } catch {
    return { share: 'no', tellSender: false, connect: false };
  }
}
