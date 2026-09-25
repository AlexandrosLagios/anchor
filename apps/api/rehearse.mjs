// Rehearses one spaced-retrieval loop against a running api.
// Needs GEMINI_API_KEY in apps/api/.env.local (loaded by the api process).
// Usage: node apps/api/rehearse.mjs [baseUrl]
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:3000';

async function post(path, body) {
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function state() {
  return (await fetch(`${base}/state`)).json();
}

console.log('moment:', (await post('moment', {
  text: "Maria's first day of school — she didn't want to let go of my hand",
  from: 'sofia',
})).ack);

const before = await state();
assert.ok(before.moments.length >= 1);
const momentId = before.moments[0].id;

const brought = await post('bring-back', { momentId });
console.log('question:', brought.question);
assert.equal(brought.ok, true);

const cued = await post('reply', { text: "I'm not sure…" });
console.log('cue:', cued.outcome);
assert.equal(cued.outcome, 'cued');

const done = await post('reply', { text: 'Maria! Sofia\'s daughter — she held her hand.' });
console.log('outcome:', done.outcome);
assert.ok(['free', 'cued'].includes(done.outcome));

const after = await state();
assert.ok(after.moments[0].rating);
assert.ok(after.chat.some((line) => line.from === 'athina'));
console.log('gapDays:', after.moments[0].gapDays);
console.log('ok');
