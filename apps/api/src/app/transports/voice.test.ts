import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { wav } from '../song';
import { toOgg } from './voice';

const noFfmpeg = Boolean(spawnSync('ffmpeg', ['-version']).error);

test.skipIf(noFfmpeg)('toOgg converts a Gemini WAV clip to OGG Opus', () => {
  const ogg = toOgg(wav(Buffer.alloc(24000 * 2), 24000));
  expect(ogg.subarray(0, 4).toString()).toBe('OggS');
  expect(ogg.includes('OpusHead')).toBe(true);
});

test.skipIf(noFfmpeg)('toOgg throws on input that is not a WAV clip', () => {
  expect(() => toOgg(Buffer.from('not a wav clip'))).toThrow(/ffmpeg/);
});
