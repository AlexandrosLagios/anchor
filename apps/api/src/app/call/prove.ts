// Rings ANCHOR_CALL_TEST_TO once, holds the staged conversation, and writes the caller's side to tmp/ as a voice note.
// Usage, from the repository root:
//   ngrok http 8787
//   ANCHOR_CALL_PUBLIC_URL=https://<id>.ngrok.app node --env-file=apps/api/.env.local -r @swc-node/register apps/api/src/app/call/prove.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocket, WebSocketServer } from 'ws';
import { bridge, type RealtimeEvent, speechOf, type TwilioEvent } from './bridge';

const PORT = Number(process.env.ANCHOR_CALL_PORT ?? 8787);
const MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1';
const MAX_CALL_MS = 10 * 60_000;

const OPENER =
  "Hello, this is Anchor, the family's record keeper. I'm not a person. " +
  "Eleni shared: \"Maria's first day of school! She wore her new red backpack.\" What does it remind you of?";

const INSTRUCTIONS = `You are Anchor, the family's record keeper, on a phone call with an older member of the family.
You are not a person. Never claim feelings or a shared past of your own.
You have already said the opening line: it quoted a moment that Eleni shared in the family chat, and asked what it reminds the person of.
Take one step per turn, and wait for the person's answer before the next step:
1. Listen, and let the person talk as long as they like. Answer warmly in one short sentence. Ask at most one short follow-up question about what they told you, or skip it when they have said enough.
2. Ask: "Shall I share what you told me with the family?"
3. Say out loud: "Thank you for telling me. Goodbye." Then call end_call with their answer.
When the person says goodbye or that they are done, say a short goodbye out loud, then call end_call.
Speak slowly and clearly, in simple English. There is no right answer.
Never mention memory loss, recall, tests, hints, or scores.`;

const env = (name: string) => process.env[name] || fail(`${name} is not set`);
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const publicUrl = env('ANCHOR_CALL_PUBLIC_URL');
const openaiKey = env('OPENAI_API_KEY');
const accountSid = env('TWILIO_ACCOUNT_SID');
const twilioAuth = `Basic ${Buffer.from(`${env('TWILIO_API_KEY_SID')}:${env('TWILIO_API_KEY_SECRET')}`).toString('base64')}`;

function toOgg(mulaw: Buffer): Buffer {
  const ffmpeg = spawnSync('ffmpeg', ['-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-f', 'ogg', 'pipe:1'], { input: mulaw });
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.error ?? ffmpeg.stderr.toString().trim().split('\n').at(-1)}`);
  return ffmpeg.stdout;
}

async function placeCall(): Promise<string> {
  const stream = `${publicUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/call`;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: { authorization: twilioAuth },
    body: new URLSearchParams({
      To: env('ANCHOR_CALL_TEST_TO'),
      From: env('TWILIO_FROM'),
      Twiml: `<Response><Connect><Stream url="${stream}"/></Connect></Response>`,
    }),
  });
  if (!response.ok) fail(`Twilio ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { sid: string }).sid;
}

const server = new WebSocketServer({ port: PORT });
const t0 = Date.now();
const log = (...args: unknown[]) => console.log(((Date.now() - t0) / 1000).toFixed(1), ...args);
let callSid: string | undefined;

server.once('connection', (twilio) => {
  // ponytail: one call per run, so the server takes no second connection; a shared host checks X-Twilio-Signature instead
  server.close();
  const startedAt = Date.now();
  const realtime = new WebSocket(`wss://api.openai.com/v1/realtime?model=${MODEL}`, { headers: { Authorization: `Bearer ${openaiKey}` } });
  const call = bridge({
    toTwilio: (event) => twilio.send(JSON.stringify(event)),
    toRealtime: (event) => realtime.readyState === WebSocket.OPEN && realtime.send(JSON.stringify(event)),
    hangUp: () => twilio.close(),
    instructions: INSTRUCTIONS,
    opener: OPENER,
  });
  const limit = setTimeout(() => twilio.close(), MAX_CALL_MS);

  realtime.on('open', () => call.open());
  realtime.on('message', (data) => {
    const event = JSON.parse(data.toString()) as RealtimeEvent & { error?: unknown };
    if (event.type === 'error') console.error('realtime error', JSON.stringify(event.error));
    else if (event.type === 'response.done') log('realtime response.done', (event.response as { status?: string }).status);
    else if (!event.type.endsWith('.delta')) log('realtime', event.type, event.transcript ?? '');
    call.realtime(event);
  });
  realtime.on('close', (code) => {
    log('realtime closed', code);
    twilio.close();
  });
  realtime.on('error', (error) => console.error('realtime socket', error.message));

  twilio.on('message', (data) => {
    const event = JSON.parse(data.toString()) as TwilioEvent;
    if (event.event === 'start' && event.start.callSid !== callSid) return twilio.close();
    if (event.event !== 'media' && event.event !== 'mark') log('twilio', event.event);
    call.twilio(event);
  });
  twilio.on('close', () => {
    clearTimeout(limit);
    realtime.close();
    const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
    const base = `tmp/call-${stamp}`;
    mkdirSync('tmp', { recursive: true });
    writeFileSync(`${base}.ogg`, toOgg(speechOf(call.record)));
    writeFileSync(`${base}-full.ogg`, toOgg(Buffer.concat(call.record.audio)));
    const { callSid: sid, share, transcript, speech, latencies, usage } = call.record;
    writeFileSync(`${base}.json`, JSON.stringify({ sid, model: MODEL, durationMs: Date.now() - startedAt, share, transcript, speech, latencies, usage }, null, 2));
    console.log(`wrote ${base}.ogg, ${base}-full.ogg, and ${base}.json`);
    process.exit(0);
  });
});

server.on('listening', async () => {
  callSid = await placeCall();
  log('calling', callSid);
});
