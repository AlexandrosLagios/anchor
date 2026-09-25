import { expect, test, vi } from 'vitest';
import { bridge, speechOf, storyOf } from './bridge';

const payload = (bytes: number, fill: number) => Buffer.alloc(bytes, fill).toString('base64');

function setup() {
  const toTwilio: object[] = [];
  const toRealtime: object[] = [];
  const hangUp = vi.fn();
  let clock = 0;
  const call = bridge({
    toTwilio: (event) => toTwilio.push(event),
    toRealtime: (event) => toRealtime.push(event),
    hangUp,
    instructions: 'Be Anchor.',
    opener: 'Hello, this is Anchor.',
    askShare: 'Shall I share what you told me with the family?',
    now: () => clock,
  });
  const tick = (ms: number) => (clock += ms);
  return { call, toTwilio, toRealtime, hangUp, tick };
}

function connected() {
  const s = setup();
  s.call.twilio({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1' } });
  s.call.open();
  s.call.realtime({ type: 'response.done', response: {} });
  s.call.twilio({ event: 'mark', mark: { name: 'listen' } });
  s.toRealtime.length = 0;
  s.toTwilio.length = 0;
  return s;
}

test('the call starts in μ-law with the opener once Twilio and Realtime are both up', () => {
  const { call, toRealtime } = setup();
  call.open();
  expect(toRealtime).toEqual([]);
  call.twilio({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1' } });
  expect(toRealtime[0]).toMatchObject({
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: 'Be Anchor.',
      reasoning: { effort: 'low' },
      audio: { input: { format: { type: 'audio/pcmu' }, noise_reduction: { type: 'near_field' } }, output: { format: { type: 'audio/pcmu' } } },
      tools: [{ type: 'function', name: 'end_call' }],
    },
  });
  expect(toRealtime[1]).toMatchObject({ type: 'response.create', response: { instructions: expect.stringContaining('Hello, this is Anchor.') } });
  expect(toRealtime).toHaveLength(2);
});

test('the caller audio goes to Realtime unchanged once the opener has played, and the bridge keeps it', () => {
  const { call, toTwilio, toRealtime } = setup();
  call.twilio({ event: 'media', media: { payload: payload(160, 1), timestamp: '0' } });
  call.twilio({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1' } });
  call.open();
  call.realtime({ type: 'response.output_audio.delta', item_id: 'opener', delta: payload(160, 9) });
  call.twilio({ event: 'media', media: { payload: payload(160, 2), timestamp: '20' } });
  call.realtime({ type: 'response.done', response: {} });
  expect(toTwilio.at(-1)).toEqual({ event: 'mark', streamSid: 'MZ1', mark: { name: 'listen' } });
  call.twilio({ event: 'mark', mark: { name: 'audio' } });
  call.twilio({ event: 'media', media: { payload: payload(160, 3), timestamp: '40' } });
  call.twilio({ event: 'mark', mark: { name: 'listen' } });
  call.twilio({ event: 'media', media: { payload: payload(160, 4), timestamp: '60' } });
  call.twilio({ event: 'stop' });
  expect(toRealtime.slice(2)).toEqual([{ type: 'input_audio_buffer.append', audio: payload(160, 4) }]);
  expect(Buffer.concat(call.record.audio)).toEqual(Buffer.alloc(160, 4));
});

test('Anchor audio goes to Twilio with a mark after each chunk', () => {
  const { call, toTwilio } = connected();
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item1', delta: payload(160, 9) });
  expect(toTwilio).toEqual([
    { event: 'media', streamSid: 'MZ1', media: { payload: payload(160, 9) } },
    { event: 'mark', streamSid: 'MZ1', mark: { name: 'audio' } },
  ]);
});

test('the caller interrupts Anchor: Twilio drops the queued audio and Realtime forgets the unheard part', () => {
  const { call, toTwilio, toRealtime } = connected();
  call.twilio({ event: 'media', media: { payload: payload(160, 1), timestamp: '1000' } });
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item1', delta: payload(160, 9) });
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item1', delta: payload(160, 9) });
  call.twilio({ event: 'mark', mark: { name: 'audio' } });
  call.twilio({ event: 'media', media: { payload: payload(160, 1), timestamp: '1400' } });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 20 });
  expect(toTwilio.at(-1)).toEqual({ event: 'clear', streamSid: 'MZ1' });
  expect(toRealtime.at(-1)).toEqual({ type: 'conversation.item.truncate', item_id: 'item1', content_index: 0, audio_end_ms: 400 });
});

test('speech with nothing playing sends no clear', () => {
  const { call, toTwilio } = connected();
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item1', delta: payload(160, 9) });
  call.twilio({ event: 'mark', mark: { name: 'audio' } });
  toTwilio.length = 0;
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 0 });
  expect(toTwilio).toEqual([]);
});

test('end_call hangs up after the goodbye has played, and keeps both answers', () => {
  const { call, toTwilio, hangUp } = connected();
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item1', delta: payload(160, 9) });
  const endCall = { type: 'function_call', name: 'end_call', arguments: '{"share":"words","tell_sender":true}' };
  call.realtime({ type: 'response.done', response: { output: [{ type: 'message' }, endCall], usage: { total_tokens: 7 } } });
  expect(call.record.share).toBe('words');
  expect(call.record.tellSender).toBe(true);
  expect(toTwilio.at(-1)).toEqual({ event: 'mark', streamSid: 'MZ1', mark: { name: 'hangup' } });
  call.twilio({ event: 'mark', mark: { name: 'audio' } });
  expect(hangUp).not.toHaveBeenCalled();
  call.twilio({ event: 'mark', mark: { name: 'hangup' } });
  expect(hangUp).toHaveBeenCalledOnce();
  expect(call.record.usage).toEqual([{ total_tokens: 7 }]);
});

test('the record keeps both sides of the transcript', () => {
  const { call } = connected();
  call.realtime({ type: 'response.output_audio_transcript.done', transcript: 'What does it remind you of?' });
  call.realtime({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Her mother at that age.' });
  expect(call.record.transcript).toEqual([
    { speaker: 'anchor', text: 'What does it remind you of?' },
    { speaker: 'person', text: 'Her mother at that age.' },
  ]);
});

test('latency runs from the end of the speech to the first Anchor audio', () => {
  const { call, tick } = connected();
  for (let i = 0; i < 50; i++) call.twilio({ event: 'media', media: { payload: payload(160, 1), timestamp: String(i * 20) } });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 100 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 400 });
  tick(700);
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item2', delta: payload(160, 9) });
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item2', delta: payload(160, 9) });
  expect(call.record.latencies).toEqual([1300]);
});

test('latency restarts when the caller speaks again before Anchor answers', () => {
  const { call, tick } = connected();
  for (let i = 0; i < 50; i++) call.twilio({ event: 'media', media: { payload: payload(160, 1), timestamp: String(i * 20) } });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 400 });
  tick(300);
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 900 });
  call.realtime({ type: 'response.output_audio.delta', item_id: 'item2', delta: payload(160, 9) });
  expect(call.record.latencies).toEqual([]);
});

test('speechOf cuts the caller audio to the detected speech, once per overlap', () => {
  const { call } = connected();
  for (let i = 0; i < 50; i++) call.twilio({ event: 'media', media: { payload: payload(160, i), timestamp: String(i * 20) } });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 100 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 140 });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 120 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 160 });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 980 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 1000 });
  expect(speechOf(call.record)).toEqual(Buffer.concat([Buffer.alloc(160, 5), Buffer.alloc(160, 6), Buffer.alloc(160, 7), Buffer.alloc(160, 49)]));
});

test('end_call with unclear answers keeps nothing and tells nobody', () => {
  const { call } = connected();
  call.realtime({ type: 'response.done', response: { output: [{ type: 'function_call', name: 'end_call', arguments: '{"share":"maybe"' }] } });
  expect(call.record.share).toBe('no');
  expect(call.record.tellSender).toBe(false);
});

test('a Realtime error before the opener has played hangs up', () => {
  const { call, hangUp } = setup();
  call.twilio({ event: 'start', start: { streamSid: 'MZ1', callSid: 'CA1' } });
  call.open();
  call.realtime({ type: 'error' });
  expect(hangUp).toHaveBeenCalledOnce();
});

test('a Realtime error after the opener keeps the call going', () => {
  const { call, hangUp } = connected();
  call.realtime({ type: 'error' });
  expect(hangUp).not.toHaveBeenCalled();
});

test('storyOf keeps only the words and the speech before the share question', () => {
  const { call } = connected();
  for (let i = 0; i < 50; i++) call.twilio({ event: 'media', media: { payload: payload(160, i), timestamp: String(i * 20) } });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 100 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 140 });
  call.realtime({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'He held his dad’s hand.' });
  call.realtime({ type: 'response.output_audio_transcript.done', transcript: 'Did he let go?' });
  call.realtime({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Only at the gate.' });
  call.realtime({ type: 'response.output_audio_transcript.done', transcript: 'Lovely. Shall I share what you told me with the family?' });
  for (let i = 50; i < 60; i++) call.twilio({ event: 'media', media: { payload: payload(160, i), timestamp: String(i * 20) } });
  call.realtime({ type: 'input_audio_buffer.speech_started', audio_start_ms: 1020 });
  call.realtime({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 1100 });
  call.realtime({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Yes, in text.' });
  expect(storyOf(call.record)).toEqual({ text: 'He held his dad’s hand. Only at the gate.', audio: Buffer.concat([Buffer.alloc(160, 5), Buffer.alloc(160, 6)]) });
});
