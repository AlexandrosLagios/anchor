// Rehearses one full call against a running api with no Twilio cost: node apps/api/rehearse.mjs [baseUrl]
// Maria's answers come from the macOS Greek voice, so the script needs macOS.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:3000';
const folder = mkdtempSync(join(tmpdir(), 'anchor-'));

function voice(name, text) {
  execFileSync('say', ['-v', 'Melina', '-o', join(folder, `${name}.aiff`), text]);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', join(folder, `${name}.aiff`), join(folder, `${name}.wav`)]);
  return readFileSync(join(folder, `${name}.wav`));
}

async function post(path, body) {
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': body instanceof Buffer ? 'audio/wav' : 'application/json' },
    body: body instanceof Buffer ? body : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

const before = await (await fetch(`${base}/state`)).json();
console.log('news:', (await post('news', { text: 'Η Άννα παντρεύεται τον Ιούνιο, στην εκκλησία στην Αίγινα' })).ack);
await post('phone/ring');
let turn = await post('phone/start');
assert.equal(turn.next, 'story');
turn = await post('phone/story', voice('story', 'Παντρευτήκαμε στο εκκλησάκι της Αίγινας. Ο Γιάννης έτρεμε από την αγωνία.'));
console.log('anchor:', turn.lines.map((line) => line.text).join(' '));
assert.equal(turn.next, 'today');
turn = await post('phone/today', voice('today', 'Η Άννα! Η εγγονή μου.'));
console.log('anchor:', turn.lines.map((line) => line.text).join(' '));
assert.equal(turn.next, undefined);

const state = await (await fetch(`${base}/state`)).json();
console.log('maria heard as:', state.call.lines.filter((line) => line.from === 'maria').map((line) => line.text));
console.log('family:', state.family.at(-1).text);
assert.equal(state.call.rating, 'free');
assert.equal(state.schedule.gapDays, before.schedule.gapDays * 2);
console.log(`PASS: remembered freely, the next call waits ${state.schedule.gapDays} days`);
