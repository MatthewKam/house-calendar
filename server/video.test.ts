import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { convertVideo, readInfo } from './video.ts';

const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string;
let dir: string;
let sample: Buffer;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'videos-'));
  // A 50-second test pattern, 640x360, with sound: longer than the 45 seconds kept.
  const src = join(dir, 'sample.mov');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=10:duration=50',
    '-f', 'lavfi', '-i', 'sine=duration=50', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', src]);
  sample = readFileSync(src);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('readInfo', () => {
  it("reads a video's size and length from ffmpeg's description", () => {
    expect(readInfo('  Duration: 00:01:02.50, start: 0\n  Stream #0:0: Video: h264 (High), yuv420p, 1080x1920 [SAR 1:1], 30 fps'))
      .toEqual({ width: 1080, height: 1920, seconds: 62.5 });
    expect(readInfo('not a video')).toBeNull();
  });
});

describe('convertVideo', () => {
  it('reports how far along it is as it converts', async () => {
    const seen: number[] = [];
    const src = join(dir, 'sample.mov');
    const meta = await convertVideo(src, join(dir, 'out.mp4'), join(dir, 'out.jpg'), (f) => seen.push(f));
    expect(meta).toMatchObject({ width: 640, height: 360 });
    expect(seen.some((f) => f > 0 && f < 1)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  }, 60_000);
});

describe('videos in the album', () => {
  it('converts an upload in the background: 45 seconds at most, no sound, streamable in pieces', async () => {
    const photos = join(dir, 'album');
    const app = buildApp(openDb(':memory:'), { photosDir: photos });
    const res = await app.inject({ method: 'POST', url: '/api/photos/video?inSlideshow=true', headers: { 'content-type': 'video/quicktime' }, payload: sample });
    expect(res.statusCode).toBe(201);
    const added = res.json();
    expect(added).toMatchObject({ kind: 'video', ready: false, url: `/api/photos/${added.id}/video` });
    expect(added.progress).toBe(0);
    // Wait for the conversion, noting how far along it said it was.
    let video = added;
    const seen: number[] = [];
    for (let i = 0; i < 600 && !video.ready; i++) {
      await new Promise((r) => setTimeout(r, 50));
      video = (await app.inject({ url: '/api/photos' })).json().find((p: { id: string }) => p.id === added.id);
      if (!video.ready) seen.push(video.progress);
    }
    expect(video).toMatchObject({ ready: true, width: 640, height: 360, inSlideshow: true, progress: null });
    // It only ever went up.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(video.seconds).toBeGreaterThan(44);
    expect(video.seconds).toBeLessThanOrEqual(45.1);
    // The recording is gone once converted; the .mp4 and its thumbnail stay.
    expect(readdirSync(photos).sort()).toEqual([`${added.id}.mp4`, `${added.id}.thumb.jpg`]);
    const part = await app.inject({ url: video.url, headers: { range: 'bytes=0-99' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect(part.rawPayload.length).toBe(100);
    expect((await app.inject({ url: video.thumbUrl })).headers['content-type']).toBe('image/jpeg');
    // No sound kept.
    const described = (() => {
      try {
        execFileSync(ffmpeg, ['-hide_banner', '-i', join(photos, `${added.id}.mp4`)], { stdio: 'pipe' });
        return '';
      } catch (e) {
        return String((e as { stderr: Buffer }).stderr);
      }
    })();
    expect(described).not.toMatch(/Audio:/);
    await app.inject({ method: 'DELETE', url: `/api/photos/${added.id}` });
    expect(existsSync(join(photos, `${added.id}.mp4`))).toBe(false);
  }, 60_000);

  it("removes a video that can't be converted", async () => {
    const app = buildApp(openDb(':memory:'), { photosDir: join(dir, 'bad') });
    const added = (await app.inject({ method: 'POST', url: '/api/photos/video', headers: { 'content-type': 'video/mp4' }, payload: Buffer.from('not a video') })).json();
    let list = [added];
    for (let i = 0; i < 100 && list.length; i++) {
      await new Promise((r) => setTimeout(r, 100));
      list = (await app.inject({ url: '/api/photos' })).json();
    }
    expect(list).toEqual([]);
  }, 20_000);
});
