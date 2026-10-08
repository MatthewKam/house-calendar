import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

// Videos for the album and screen saver: whatever the phone recorded (an iPhone's HEVC .mov, say)
// becomes an H.264 .mp4 that every browser and a Raspberry Pi can play: at most 1080p (1920 on the
// long side), 30 frames a second, no sound (the wall plays them muted), and the first 45 seconds.
// ffmpeg comes with the ffmpeg-static package, so nothing needs installing on the machine.

const run = promisify(execFile);
const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string | null;

/** The longest a video can be; longer ones keep their first 45 seconds. */
export const MAX_SECONDS = 45;

export interface VideoInfo { width: number; height: number; seconds: number }

/** Reads a video's size and length from what ffmpeg prints about it. */
export function readInfo(text: string): VideoInfo | null {
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
  const v = /Video: [^\n]*?, (\d{2,5})x(\d{2,5})/.exec(text);
  if (!d || !v) return null;
  return { width: +v[1], height: +v[2], seconds: +d[1] * 3600 + +d[2] * 60 + +d[3] };
}

async function info(file: string) {
  // With no output named, ffmpeg describes the file and exits with an error; the description is what we want.
  const out = await run(ffmpeg!, ['-hide_banner', '-i', file]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? '' }));
  return readInfo(out.stderr);
}

/**
 * Converts `input` to the wall's .mp4 at `output` and a JPEG thumbnail at `thumb`, reporting how far
 * along it is (0 to 1) as it goes.
 */
export async function convertVideo(input: string, output: string, thumb: string, onProgress: (f: number) => void = () => {}): Promise<VideoInfo> {
  if (!ffmpeg) throw new Error('ffmpeg is missing (npm install ffmpeg-static)');
  // How much there is to convert, for the progress.
  const total = Math.min(MAX_SECONDS, (await info(input))?.seconds ?? MAX_SECONDS);
  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpeg, [
      '-hide_banner', '-y', '-i', input, '-t', String(MAX_SECONDS), '-map', '0:v:0', '-an',
      // Fit inside 1920x1920 (keeping its shape), even sizes (H.264 needs them), 30 fps at most.
      '-vf', "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      // The index at the front, so it starts playing before it's all downloaded.
      '-movflags', '+faststart',
      // "out_time_us=..." lines as it goes: how much is done.
      '-progress', 'pipe:1', '-nostats', output,
    ]);
    let errors = '';
    p.stdout.on('data', (chunk: Buffer) => {
      const done = /out_time_us=(\d+)/.exec(chunk.toString().split('\n').filter((l) => l.startsWith('out_time_us=')).at(-1) ?? '');
      if (done && total > 0) onProgress(Math.min(0.99, +done[1] / 1e6 / total));
    });
    p.stderr.on('data', (chunk: Buffer) => (errors = (errors + chunk.toString()).slice(-2000)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${errors.trim().split('\n').at(-1)}`))));
  });
  const meta = await info(output);
  if (!meta) throw new Error("Couldn't read the converted video");
  // A frame from just in, 480 on its long side, for the album grid (and behind the video while it loads).
  await run(ffmpeg, ['-hide_banner', '-y', '-ss', String(Math.min(0.5, meta.seconds / 2)), '-i', output, '-frames:v', '1',
    '-vf', "scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)'", '-q:v', '4', thumb]);
  return meta;
}
