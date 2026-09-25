// Rings ANCHOR_CALL_TEST_TO once with a staged moment, through the same ingress as the bot, and writes the call to tmp/.
// Usage, from the repository root:
//   ngrok http 8787
//   ANCHOR_PUBLIC_URL=https://<id>.ngrok.app node --env-file=apps/api/.env.local -r @swc-node/register apps/api/src/app/call/prove.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { speechOf, storyOf } from './bridge';
import { answered, ring } from './dial';
import { toOgg } from './ogg';
import { attachCallStream, expectCall, STREAM_PATH } from './stream';

const PORT = Number(process.env.ANCHOR_CALL_PORT ?? 8787);
const ASK_SHARE = 'Shall I share what you told me with the family?';

const OPENER =
  "Hello, this is Anchor, the family's record keeper. I'm not a person. " +
  "Eleni shared: \"Maria's first day of school! She wore her new red backpack.\" What does it remind you of?";

const INSTRUCTIONS = `You are Anchor, the family's record keeper, on a phone call with an older member of the family.
You are not a person. Never claim feelings or a shared past of your own.
You have already said the opening line: it quoted a moment that Eleni shared in the family chat, and asked what it reminds the person of.
Take one step per turn, and wait for the person's answer before the next step:
1. Listen, and let the person talk as long as they like. Answer warmly in one short sentence. Ask at most one short follow-up question about what they told you, or skip it when they have said enough.
2. Ask: "${ASK_SHARE}"
3. Ask: "Shall I tell Eleni you'd love a call?"
4. Say out loud: "Thank you. Goodbye." Then call end_call with their answers.
When the person says goodbye or that they are done, say a short goodbye out loud, then call end_call.
Speak slowly and clearly, in simple English. There is no right answer.
Never mention memory loss, recall, tests, hints, or scores.`;

const env = (name: string) => process.env[name] || fail(`${name} is not set`);
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const stream = `${env('ANCHOR_PUBLIC_URL').replace(/^http/, 'ws').replace(/\/$/, '')}${STREAM_PATH}`;
const to = env('ANCHOR_CALL_TEST_TO');
env('OPENAI_API_KEY');

const server = createServer();
attachCallStream(server);
server.listen(PORT, async () => {
  const call = expectCall({ instructions: INSTRUCTIONS, opener: OPENER, askShare: ASK_SHARE, goodbye: 'Thank you. Goodbye.' });
  const sid = await ring(to, stream, call.token);
  console.log('calling', sid);
  if (!(await answered(sid))) {
    call.forget();
    fail('nobody answered');
  }
  console.log('answered');
  const record = await call.ended;
  const base = `tmp/call-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  mkdirSync('tmp', { recursive: true });
  const story = storyOf(record);
  if (story.audio.length) writeFileSync(`${base}.ogg`, toOgg(story.audio));
  if (record.audio.length) writeFileSync(`${base}-full.ogg`, toOgg(speechOf(record)));
  const { callSid, share, tellSender, transcript, speech, latencies, usage } = record;
  writeFileSync(`${base}.json`, JSON.stringify({ callSid, share, tellSender, story: story.text, transcript, speech, latencies, usage }, null, 2));
  console.log(`wrote ${base}.json; share ${share}, tell the sender ${tellSender}; latencies ${latencies.join(', ')} ms`);
  process.exit(0);
});
