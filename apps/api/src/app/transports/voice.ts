import { spawnSync } from 'node:child_process';

// ponytail: spawnSync blocks the event loop for about 100 ms per invitation clip; move to spawn when clips get long
export function toOgg(wav: Buffer): Buffer {
  const ffmpeg = spawnSync('ffmpeg', ['-f', 'wav', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1'], { input: wav });
  if (ffmpeg.error || ffmpeg.status !== 0) throw new Error(`ffmpeg failed: ${ffmpeg.error ?? ffmpeg.stderr.toString().trim().split('\n').at(-1)}`);
  return ffmpeg.stdout;
}
