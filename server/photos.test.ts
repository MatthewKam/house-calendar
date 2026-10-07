import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

// The smallest valid-looking JPEG: SOI marker, then filler.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4, 0xff, 0xd9]);

let dir: string;
let app: ReturnType<typeof buildApp>;
const upload = (query: string, body: Buffer = JPEG) =>
  app.inject({ method: 'POST', url: `/api/photos?${query}`, headers: { 'content-type': 'image/jpeg' }, payload: body });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'photos-'));
  app = buildApp(openDb(':memory:'), { photosDir: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('photo album', () => {
  it('stores an upload and its thumbnail, newest first, and serves them', async () => {
    const riley = (await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Riley', color: '#2fa66a' } })).json().id;
    const older = (await upload('width=2560&height=1920&takenAt=2025-07-04T12:00:00Z')).json();
    const res = await upload(`width=1920&height=2560&takenAt=2026-10-01T09:00:00Z&memberId=${riley}`);
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p).toMatchObject({ width: 1920, height: 2560, memberId: riley, inSlideshow: true, thumbUrl: `/api/photos/${p.id}/full` });
    await app.inject({ method: 'PUT', url: `/api/photos/${p.id}/thumb`, headers: { 'content-type': 'image/jpeg' }, payload: JPEG });
    const list = (await app.inject({ url: '/api/photos' })).json();
    expect(list.map((x: any) => x.id)).toEqual([p.id, older.id]);
    expect(list[0].thumbUrl).toBe(`/api/photos/${p.id}/thumb`);
    const file = await app.inject({ url: `/api/photos/${p.id}/full` });
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.rawPayload.equals(JPEG)).toBe(true);
  });

  it('only takes JPEGs', async () => {
    expect((await upload('width=10&height=10', Buffer.from('<svg/>'))).statusCode).toBe(415);
  });

  it('can leave a photo out of the slideshow, and deletes it with its files', async () => {
    const p = (await upload('width=10&height=10')).json();
    expect((await app.inject({ method: 'PATCH', url: `/api/photos/${p.id}`, payload: { inSlideshow: false } })).json().inSlideshow).toBe(false);
    expect((await app.inject({ method: 'DELETE', url: `/api/photos/${p.id}` })).statusCode).toBe(204);
    expect(existsSync(join(dir, `${p.id}.jpg`))).toBe(false);
    expect((await app.inject({ url: `/api/photos/${p.id}/full` })).statusCode).toBe(404);
  });

  it('changes or deletes several photos at once', async () => {
    const [a, b, c] = [(await upload('width=10&height=10')).json(), (await upload('width=10&height=10')).json(), (await upload('width=10&height=10')).json()];
    await app.inject({ method: 'POST', url: '/api/photos/slideshow', payload: { ids: [a.id, b.id], inSlideshow: false } });
    const inShow = (await app.inject({ url: '/api/photos' })).json().filter((p: any) => p.inSlideshow).map((p: any) => p.id);
    expect(inShow).toEqual([c.id]);
    expect((await app.inject({ method: 'POST', url: '/api/photos/delete', payload: { ids: [a.id, c.id, 'nope'] } })).json()).toEqual({ deleted: 2 });
    expect((await app.inject({ url: '/api/photos' })).json().map((p: any) => p.id)).toEqual([b.id]);
    expect(existsSync(join(dir, `${a.id}.jpg`))).toBe(false);
  });
});
