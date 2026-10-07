import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';

// The photo album. Browsers resize photos before uploading (2560px on the long side, plus a small
// thumbnail), so the server only stores JPEGs: data/photos/<id>.jpg and <id>.thumb.jpg.

interface PhotoRow {
  id: string; width: number; height: number; taken_at: string | null; member_id: string | null;
  source: string; in_slideshow: number; has_thumb: number; created_at: string;
}

const MAX_BYTES = 20 * 1024 * 1024;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const toPhoto = (r: PhotoRow) => ({
  id: r.id, width: r.width, height: r.height, takenAt: r.taken_at, memberId: r.member_id, source: r.source,
  inSlideshow: r.in_slideshow === 1, createdAt: r.created_at,
  url: `/api/photos/${r.id}/full`, thumbUrl: `/api/photos/${r.id}/${r.has_thumb ? 'thumb' : 'full'}`,
});

export function registerPhotos(app: FastifyInstance, db: DB, dir: string) {
  mkdirSync(dir, { recursive: true });
  const file = (id: string, thumb = false) => join(dir, `${id}${thumb ? '.thumb' : ''}.jpg`);
  const get = (id: string) => db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow | undefined;

  // Photos arrive as the raw JPEG in the request body.
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_req, body, done) => done(null, body));

  // Newest first (by when they were taken, else added).
  app.get('/api/photos', async () =>
    (db.prepare('SELECT * FROM photos ORDER BY COALESCE(taken_at, created_at) DESC').all() as PhotoRow[]).map(toPhoto));

  app.post<{ Querystring: { width: number; height: number; takenAt?: string; memberId?: string; inSlideshow?: boolean } }>('/api/photos', {
    bodyLimit: MAX_BYTES,
    schema: { querystring: { type: 'object', required: ['width', 'height'], properties: {
      width: { type: 'integer', minimum: 1, maximum: 20000 }, height: { type: 'integer', minimum: 1, maximum: 20000 },
      takenAt: { type: 'string', maxLength: 40 }, memberId: { type: 'string' }, inSlideshow: { type: 'boolean' } } } },
  }, async (req, reply) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !isJpeg(body)) return reply.code(415).send({ error: 'Photos are uploaded as JPEG' });
    const { memberId } = req.query;
    if (memberId && !db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(400).send({ error: 'Unknown member' });
    const takenAt = req.query.takenAt && !Number.isNaN(Date.parse(req.query.takenAt)) ? new Date(req.query.takenAt).toISOString() : null;
    const id = randomUUID();
    writeFileSync(file(id), body);
    // New photos go into the screen saver unless the upload says otherwise.
    db.prepare('INSERT INTO photos (id, width, height, taken_at, member_id, in_slideshow) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.query.width, req.query.height, takenAt, memberId ?? null, req.query.inSlideshow === false ? 0 : 1);
    reply.code(201);
    return toPhoto(get(id)!);
  });

  // The small version for the album grid, sent right after the photo.
  app.put<{ Params: { id: string } }>('/api/photos/:id/thumb', { bodyLimit: MAX_BYTES }, async (req, reply) => {
    const body = req.body as Buffer;
    if (!get(req.params.id)) return reply.code(404).send({ error: 'Photo not found' });
    if (!Buffer.isBuffer(body) || !isJpeg(body)) return reply.code(415).send({ error: 'Thumbnails are JPEG' });
    writeFileSync(file(req.params.id, true), body);
    db.prepare('UPDATE photos SET has_thumb = 1 WHERE id = ?').run(req.params.id);
    return toPhoto(get(req.params.id)!);
  });

  for (const size of ['full', 'thumb'] as const) {
    app.get<{ Params: { id: string } }>(`/api/photos/:id/${size}`, async (req, reply) => {
      const path = file(req.params.id, size === 'thumb');
      if (!/^[0-9a-f-]{36}$/.test(req.params.id) || !existsSync(path)) return reply.code(404).send({ error: 'Photo not found' });
      // A photo's file never changes (ids are new for each upload), so browsers can keep it.
      return reply.header('content-type', 'image/jpeg').header('cache-control', 'public, max-age=31536000, immutable')
        .send(createReadStream(path));
    });
  }

  app.patch<{ Params: { id: string }; Body: { inSlideshow?: boolean; memberId?: string | null } }>('/api/photos/:id', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1,
      properties: { inSlideshow: { type: 'boolean' }, memberId: { type: ['string', 'null'] } } } },
  }, async (req, reply) => {
    const row = get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Photo not found' });
    const memberId = req.body.memberId === undefined ? row.member_id : req.body.memberId;
    if (memberId && !db.prepare('SELECT 1 FROM members WHERE id = ?').get(memberId)) return reply.code(400).send({ error: 'Unknown member' });
    db.prepare('UPDATE photos SET in_slideshow = ?, member_id = ? WHERE id = ?')
      .run(req.body.inSlideshow === undefined ? row.in_slideshow : req.body.inSlideshow ? 1 : 0, memberId, row.id);
    return toPhoto(get(row.id)!);
  });

  /** Removes a photo and its files; false if there was no such photo. */
  function removePhoto(id: string) {
    const res = db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    if (!res.changes) return false;
    for (const thumb of [false, true]) {
      try {
        unlinkSync(file(id, thumb));
      } catch {
        // Already gone.
      }
    }
    return true;
  }

  app.delete<{ Params: { id: string } }>('/api/photos/:id', async (req, reply) => {
    if (!removePhoto(req.params.id)) return reply.code(404).send({ error: 'Photo not found' });
    return reply.code(204).send();
  });

  // Several at once, for the album's Select mode: in or out of the screen saver, or deleted.
  const IDS = { type: 'array', minItems: 1, maxItems: 5000, items: { type: 'string' } } as const;
  app.post<{ Body: { ids: string[]; inSlideshow: boolean } }>('/api/photos/slideshow', {
    schema: { body: { type: 'object', required: ['ids', 'inSlideshow'], additionalProperties: false,
      properties: { ids: IDS, inSlideshow: { type: 'boolean' } } } },
  }, async (req) => {
    db.prepare('UPDATE photos SET in_slideshow = ? WHERE id IN (SELECT value FROM json_each(?))')
      .run(req.body.inSlideshow ? 1 : 0, JSON.stringify(req.body.ids));
    return { changed: req.body.ids.length };
  });
  app.post<{ Body: { ids: string[] } }>('/api/photos/delete', {
    schema: { body: { type: 'object', required: ['ids'], additionalProperties: false, properties: { ids: IDS } } },
  }, async (req) => ({ deleted: req.body.ids.filter(removePhoto).length }));
}
