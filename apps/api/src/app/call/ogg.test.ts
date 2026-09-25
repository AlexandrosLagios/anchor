import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { toOgg as wavToOgg } from '../transports/voice';
import { mulawWav, toOgg } from './ogg';

const noFfmpeg = Boolean(spawnSync('ffmpeg', ['-version']).error);

test.skipIf(noFfmpeg)('toOgg converts a μ-law phone clip to OGG Opus', () => {
  const ogg = toOgg(Buffer.alloc(8000, 0xff));
  expect(ogg.subarray(0, 4).toString()).toBe('OggS');
  expect(ogg.includes('OpusHead')).toBe(true);
});

test('mulawWav wraps μ-law in a WAV header', () => {
  const wav = mulawWav(Buffer.alloc(8000, 0xff));
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.readUInt16LE(20)).toBe(7);
  expect(wav.readUInt32LE(24)).toBe(8000);
  expect(wav.length).toBe(44 + 8000);
});

test.skipIf(noFfmpeg)('the Telegram voice pipeline converts a μ-law WAV to OGG Opus', () => {
  expect(wavToOgg(mulawWav(Buffer.alloc(8000, 0xff))).subarray(0, 4).toString()).toBe('OggS');
});
