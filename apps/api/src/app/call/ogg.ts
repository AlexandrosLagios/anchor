import { spawnSync } from 'node:child_process';

// ponytail: copies the ffmpeg pipeline of transports/voice.ts with a μ-law input; the review after the demo removes the copy
export function toOgg(mulaw: Buffer): Buffer {
  const ffmpeg = spawnSync('ffmpeg', ['-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-f', 'ogg', 'pipe:1'], { input: mulaw });
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.error ?? ffmpeg.stderr.toString().trim().split('\n').at(-1)}`);
  return ffmpeg.stdout;
}
