import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { toOgg } from './ogg';

const noFfmpeg = Boolean(spawnSync('ffmpeg', ['-version']).error);

test.skipIf(noFfmpeg)('toOgg converts a μ-law phone clip to OGG Opus', () => {
  const ogg = toOgg(Buffer.alloc(8000, 0xff));
  expect(ogg.subarray(0, 4).toString()).toBe('OggS');
  expect(ogg.includes('OpusHead')).toBe(true);
});
