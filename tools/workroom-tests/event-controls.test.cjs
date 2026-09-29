const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const sharp = require('sharp');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, env = { NODE_ENV: 'development' }) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} }, context = vm.createContext({ module, exports: module.exports, process: { env }, Buffer, Request, Response, URL, Date, structuredClone, AbortController, setTimeout, clearTimeout, fetch: () => { throw Error('Unexpected network'); },
    require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; if (name === 'server-only') return {}; if (name === 'node:crypto') return crypto; if (name === 'sharp') return sharp; throw Error('Unexpected dependency: ' + name); }
  });
  new vm.Script(source, { filename: file }).runInContext(context); return module.exports;
}
const json = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const fields = load('lib/workroom/events-def.ts'), cas = load('lib/workroom/content-cas.ts'), eventCas = load('lib/workroom/event-cas.ts');
  const storage = load('lib/workroom/store.ts', { './content-cas': cas, './event-cas': eventCas });
  const content = { EVENTS_CONTACT_KEY: 'events-contact' };
  const service = load('lib/workroom/event-service.ts', { './store': storage, './content-cas': cas, './events-def': fields, '@/lib/content': content });
  let authed = true;
  const mocks = { 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } }, 'next/cache': { revalidatePath() {} }, '@/lib/workroom/auth': { isWorkroomAuthed: async () => authed }, '@/lib/workroom/store': storage, '@/lib/workroom/content-cas': cas, '@/lib/workroom/events-def': fields, '@/lib/workroom/event-service': service, '@/lib/content': content, '@/lib/workroom/event-photo': load('lib/workroom/event-photo.ts') };
  return { fields, cas, storage, service, mocks, setAuth: value => { authed = value; }, route: load('app/api/workroom/events/route.ts', mocks), contact: load('app/api/workroom/events/contact/route.ts', mocks), photo: load('app/api/workroom/events/image/route.ts', mocks) };
}
const request = (body, method = 'PUT') => new Request('https://fixture.invalid/api/workroom/events', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const draft = fields => ({ ...fields.blankEvent(), title: 'Fixture event', date: '2026-10-12', startTime: '19:00' });

test('event validation rejects impossible dates, times, omitted fields and oversized content', () => {
  const fields = load('lib/workroom/events-def.ts'), valid = draft(fields);
  assert.equal(fields.parseEventDraft({ ...valid, published: undefined }), null);
  assert.equal(fields.parseEventDraft({ ...valid, price: 1 }), null);
  for (const [key, value] of [['date', '2026-02-31'], ['date', '2025-02-29'], ['startTime', '24:00'], ['endTime', '19:99'], ['title', 'x'.repeat(81)], ['ticketUrl', 'javascript:alert(1)']]) assert(fields.parseEventDraft({ ...valid, [key]: value }).errors[key]);
  assert.equal(Object.keys(fields.parseEventDraft({ ...valid, date: '2028-02-29' }).errors).length, 0);
  assert(fields.parseEventDraft({ ...valid, date: '2026-03-08', startTime: '02:30' }).errors.startTime);
  assert.equal(Object.keys(fields.parseEventDraft({ ...valid, date: '2026-11-01', startTime: '01:30' }).errors).length, 0);
  assert.equal(fields.parseEventsContact({ name: 'Only a name' }), null);
  assert(fields.parseEventsContact({ name: '', email: 'x'.repeat(121), phone: '' }).errors.email);
});

test('create retries retain one event, stale edits cannot overwrite it, and accepted changes are audited', async () => {
  const f = fixture(), event = { ...draft(f.fields), id: 'evt_fixtureone' };
  const first = await f.route.PUT(request({ event, revision: null })); assert.equal(first.status, 200);
  const saved = await first.json(); assert(f.fields.isEventsListing(saved)); assert.equal(saved.history.length, 1);
  assert.equal((await f.route.PUT(request({ event, revision: null }))).status, 409);
  assert.equal((await f.route.PUT(request({ event }))).status, 409);
  const changed = await f.route.PUT(request({ event: { ...event, title: 'Updated event' }, revision: saved.event.revision })); assert.equal(changed.status, 200);
  assert.equal((await f.route.PUT(request({ event: { ...event, title: 'Stale event' }, revision: saved.event.revision }))).status, 409);
  const listing = await f.service.eventListing(); assert.equal(listing.events.length, 1); assert.equal(listing.events[0].title, 'Updated event'); assert.equal(listing.history.length, 2);
  const audit = await f.storage.getStore().eventHistory(); assert.equal(audit[0].before.title, 'Fixture event'); assert.equal(audit[0].after.title, 'Updated event');
});

test('archive and restore use revisions, retain the record, and restore as an unpublished draft', async () => {
  const f = fixture(), event = { ...draft(f.fields), id: 'evt_archivetest' };
  const first = await (await f.route.PUT(request({ event, revision: null }))).json();
  assert.equal((await f.route.DELETE(request({ id: event.id, revision: 'old' }, 'DELETE'))).status, 409);
  const archived = await (await f.route.DELETE(request({ id: event.id, revision: first.event.revision }, 'DELETE'))).json();
  assert(archived.event.archivedAt); assert.equal(archived.event.published, false);
  assert.equal((await f.route.PUT(request({ event, revision: archived.event.revision }))).status, 409);
  const restored = await (await f.route.POST(request({ id: event.id, revision: archived.event.revision }, 'POST'))).json();
  assert.equal(restored.event.archivedAt, undefined); assert.equal(restored.event.published, false);
  assert.equal((await f.storage.getStore().events.list()).length, 1);
  assert.deepEqual(restored.history.map(e => e.action), ['restored', 'archived', 'saved']);
});

test('contact edits require the current snapshot and all fields, without clearing other owners changes', async () => {
  const f = fixture(), initial = await f.service.eventListing(), contact = { name: 'Fixture contact', email: 'fixture@example.invalid', phone: '' };
  assert.equal((await f.contact.PUT(request({ contact: { name: 'Incomplete' }, revision: initial.contactRevision }))).status, 400);
  const result = await f.contact.PUT(request({ contact, revision: initial.contactRevision })); assert.equal(result.status, 200);
  assert.equal((await f.contact.PUT(request({ contact: { ...contact, name: 'Stale' }, revision: initial.contactRevision }))).status, 409);
  assert.deepEqual(json(await f.storage.getStore().getValue('events-contact')), contact);
  assert.equal((await f.storage.getStore().contentHistory('events-contact')).length, 1);
});

test('unauthorized and production-memory mutations cannot write events, contacts or images', async () => {
  const f = fixture(); f.setAuth(false);
  for (const [route, method] of [[f.route, 'GET'], [f.route, 'PUT'], [f.route, 'DELETE'], [f.route, 'POST'], [f.contact, 'PUT'], [f.photo, 'POST']]) assert.equal((await route[method](request({}, method === 'GET' ? 'PUT' : method))).status, 401);
  f.setAuth(true);
  for (const [file, method] of [['app/api/workroom/events/route.ts', 'PUT'], ['app/api/workroom/events/route.ts', 'DELETE'], ['app/api/workroom/events/route.ts', 'POST'], ['app/api/workroom/events/contact/route.ts', 'PUT'], ['app/api/workroom/events/image/route.ts', 'POST']]) assert.equal((await load(file, f.mocks, { NODE_ENV: 'production' })[method](request({}, method))).status, 503);
  assert.equal((await f.storage.getStore().events.list()).length, 0);
});

test('photo bytes are decoded, normalized and deduplicated, and shared photos survive edit/archive', async () => {
  const f = fixture();
  assert.equal((await f.photo.POST(request({ dataUrl: 'data:image/png;base64,aGVsbG8=' }, 'POST'))).status, 400);
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#446688' } }).png().toBuffer();
  const body = { dataUrl: 'data:image/png;base64,' + png.toString('base64') };
  const image = await (await f.photo.POST(request(body, 'POST'))).json(); assert.match(image.id, /^img_[a-f0-9]{64}$/);
  const repeated = await (await f.photo.POST(request(body, 'POST'))).json(); assert.equal(repeated.id, image.id);
  assert.equal((await f.storage.getStore().images.list()).length, 1);
  const stored = await f.storage.getStore().images.get(image.id); assert.equal(stored.contentType, 'image/jpeg');
  assert.equal((await sharp(Buffer.from(stored.base64, 'base64')).metadata()).format, 'jpeg');
  const event = { ...draft(f.fields), imageId: image.id, imageAlt: 'Fixture flyer' };
  const a = await (await f.route.PUT(request({ event: { ...event, id: 'evt_photoa' }, revision: null }))).json();
  const b = await (await f.route.PUT(request({ event: { ...event, id: 'evt_photob' }, revision: null }))).json();
  assert.equal((await f.route.PUT(request({ event: { ...event, id: 'evt_photoa', imageId: '' }, revision: a.event.revision }))).status, 200);
  assert.equal((await f.route.DELETE(request({ id: 'evt_photob', revision: b.event.revision }, 'DELETE'))).status, 200);
  assert(await f.storage.getStore().images.get(image.id));
});

test('PostgreSQL event writes and their audit records are atomic, with duplicate/stale writes rejected', async () => {
  const db = new PGlite(), { compareEvent } = load('lib/workroom/event-cas.ts'), { CONTENT_HISTORY_SCHEMA } = load('lib/workroom/content-cas.ts');
  try {
    await db.exec('CREATE TABLE workroom_events(key text PRIMARY KEY,data jsonb NOT NULL);' + CONTENT_HISTORY_SCHEMA);
    const query = (sql, params) => db.query(sql, params), key = 'evt_sqltest';
    assert.deepEqual(await Promise.all([compareEvent(query, key, null, { title: 'First' }), compareEvent(query, key, null, { title: 'Second' })]), [true, false]);
    assert.equal(await compareEvent(query, key, { title: 'Stale' }, { title: 'Wrong' }), false);
    assert.equal(await compareEvent(query, key, { title: 'First' }, { title: 'Archived', archivedAt: 1 }), true);
    await db.exec("ALTER TABLE workroom_content_history ADD CONSTRAINT fail_fixture CHECK (actor <> 'owner') NOT VALID");
    await assert.rejects(compareEvent(query, key, { title: 'Archived', archivedAt: 1 }, { title: 'Should roll back' }));
    assert.deepEqual((await db.query('SELECT data FROM workroom_events')).rows[0].data, { title: 'Archived', archivedAt: 1 });
    assert.equal((await db.query('SELECT * FROM workroom_content_history')).rows.length, 2);
  } finally { await db.close(); }
});

test('generic owner requests require validated acknowledgement and never retry an uncertain write', async () => {
  const { ownerRequest } = load('lib/workroom/owner-request.ts'); let calls = 0;
  const valid = value => value?.ok === true && value.id === 'fixture';
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const result = await ownerRequest('/fixture', method, {}, valid, async (_url, init) => { calls++; assert.equal(init.method, method); return Response.json({ ok: true, id: 'fixture' }); });
    assert.equal(result.kind, 'saved');
  }
  assert.equal(calls, 3);
  assert.equal((await ownerRequest('/fixture', 'PUT', {}, valid, async () => Response.json({ ok: true }))).kind, 'uncertain');
  for (const [status, kind] of [[401, 'locked'], [409, 'conflict'], [400, 'invalid'], [503, 'uncertain']]) assert.equal((await ownerRequest('/fixture', 'PUT', {}, valid, async () => Response.json({}, { status }))).kind, kind);
  let timeoutCalls = 0;
  const timeout = await ownerRequest('/fixture', 'POST', {}, valid, (_url, init) => { timeoutCalls++; return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('timeout')))); }, 5);
  assert.equal(timeout.kind, 'uncertain'); assert.equal(timeoutCalls, 1);
});
