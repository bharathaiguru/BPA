// tests/api.test.js — end-to-end API tests for permissions and lifecycle rules.
// Run with:  npm test
// Uses a throwaway demo database so your real data is never touched.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DB_FILE = path.join(os.tmpdir(), `mm-test-${process.pid}.db`);
process.env.DB_FILE = DB_FILE;
const app = require('../server');
const { zonedToUtc, generateSlots } = require('../lib/time');

let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}/api`; r(); }); }));
after(() => { server.close(); for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true }); });

// Tiny client that keeps a session cookie per user.
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { get: u => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), patch: (u, b) => call('PATCH', u, b), del: (u, b) => call('DELETE', u, b) };
}
async function login(email) { const c = client(); const r = await c.post('/auth/login', { email, password: 'Password123!' }); assert.equal(r.status, 200, `login ${email}`); return c; }
const idOf = async (c, email) => (await c.get('/admin/users?q=' + encodeURIComponent(email))).body[0].id;

test('time zones: wall-clock → UTC handles daylight saving time', () => {
  // 10:00 in Chicago on Jan 15 is UTC-6; on Jul 15 it is UTC-5.
  assert.equal(new Date(zonedToUtc(2026, 1, 15, 600, 'America/Chicago')).toISOString(), '2026-01-15T16:00:00.000Z');
  assert.equal(new Date(zonedToUtc(2026, 7, 15, 600, 'America/Chicago')).toISOString(), '2026-07-15T15:00:00.000Z');
  // Slots never overlap busy intervals.
  const from = Date.parse('2026-12-01T00:00:00Z'); // a Tuesday
  const busy = [[Date.parse('2026-12-01T21:00:00Z'), Date.parse('2026-12-01T21:30:00Z')]]; // 15:00–15:30 Chicago
  const slots = generateSlots([{ weekday: 2, start_min: 900, end_min: 1020 }], 'America/Chicago', 30, busy, { fromMs: from, days: 1, leadMinutes: 0 });
  assert.deepEqual(slots.map(s => new Date(s).toISOString()), ['2026-12-01T21:30:00.000Z', '2026-12-01T22:00:00.000Z', '2026-12-01T22:30:00.000Z']);
});

test('public pages show only approved mentors and never student data', async () => {
  const c = client();
  const mentors = (await c.get('/public/mentors')).body;
  assert.ok(mentors.length >= 6);
  assert.ok(!mentors.some(m => m.name === 'Daniel Kim'), 'pending mentor must be hidden');
  assert.ok(!JSON.stringify(mentors).includes('@'), 'no emails in public data');
  const marcus = mentors.find(m => m.name === 'Marcus Bell');
  const detail = (await c.get(`/public/mentors/${marcus.id}`)).body;
  assert.ok(detail.reviews.length >= 1);
  assert.ok(!JSON.stringify(detail.reviews).includes('Sam'), 'student reviewer name must not be exposed');
});

test('registration: field errors, guardian acknowledgment, and mentor approval status', async () => {
  const c = client();
  let r = await c.post('/auth/register', { role: 'mentee', name: 'Test Kid', email: 'bad', password: 'abc' });
  assert.equal(r.status, 400); assert.equal(r.body.field, 'email');
  r = await c.post('/auth/register', { role: 'mentee', name: 'Test Kid', email: 'kid@example.com', password: 'Password123!', agree: true, profile: { grade_level: '10th grade', interests: ['art'] } });
  assert.equal(r.status, 400); assert.equal(r.body.field, 'guardianAck');
  r = await c.post('/auth/register', { role: 'mentee', name: 'Test Kid', email: 'kid@example.com', password: 'Password123!', agree: true, guardianAck: true, profile: { grade_level: '10th grade', interests: ['art'] } });
  assert.equal(r.status, 201);
  const m = client();
  r = await m.post('/auth/register', { role: 'mentor', name: 'New Mentor', email: 'newmentor@example.com', password: 'Password123!', agree: true, profile: { headline: 'Designer', industry: 'Arts & Media', interests: ['design'] } });
  assert.equal(r.status, 201); assert.equal(r.body.approval_status, 'pending');
});

test('student profiles are private to connected mentors and admins', async () => {
  const sam = await login('sam@example.com');
  const samId = (await sam.get('/auth/me')).body.id;
  const elena = await login('elena@example.com');
  assert.equal((await elena.get(`/users/${samId}`)).status, 403);
  const marcus = await login('marcus@example.com');
  assert.equal((await marcus.get(`/users/${samId}`)).status, 200);
});

test('recommendations are explainable and exclude existing connections', async () => {
  const sam = await login('sam@example.com');
  const r = (await sam.get('/recommendations?limit=5')).body;
  assert.ok(Array.isArray(r.mentors));
  assert.ok(!r.mentors.some(m => m.name === 'Marcus Bell'), 'already-connected mentor is not re-recommended');
  for (const m of r.mentors) { assert.ok(m.match.score > 0); assert.ok(m.accepting); }
});

test('booking: requires acceptance, uses real slots, and rejects overlaps', async () => {
  const sam = await login('sam@example.com');
  const pub = (await sam.get('/mentors')).body;
  const marcus = pub.find(m => m.name === 'Marcus Bell'), priya = pub.find(m => m.name === 'Dr. Priya Raman');
  const pSlots = (await sam.get(`/mentors/${priya.id}/slots?duration=30`)).body.slots;
  let r = await sam.post('/sessions', { mentorId: priya.id, startsAt: pSlots[0], duration: 30, type: 'video', topic: 'Pre-med questions' });
  assert.equal(r.status, 403, 'cannot book before the mentor accepts');

  const { slots } = (await sam.get(`/mentors/${marcus.id}/slots?duration=60`)).body;
  assert.ok(slots.length > 0 && slots.every(s => s.endsWith('Z')));
  r = await sam.post('/sessions', { mentorId: marcus.id, startsAt: slots[0], duration: 60, type: 'video', topic: 'Resume review' });
  assert.equal(r.status, 201);
  const booked = r.body;
  // Same time again → conflict
  r = await sam.post('/sessions', { mentorId: marcus.id, startsAt: slots[0], duration: 30, type: 'video', topic: 'Again' });
  assert.equal(r.status, 409);
  // Different start that overlaps the 60-minute session → conflict
  const overlapping = new Date(Date.parse(slots[0]) + 30 * 60000).toISOString();
  r = await sam.post('/sessions', { mentorId: marcus.id, startsAt: overlapping, duration: 30, type: 'video', topic: 'Overlap test' });
  assert.equal(r.status, 409);
  // Slots list no longer offers the overlapping time
  const after = (await sam.get(`/mentors/${marcus.id}/slots?duration=30`)).body.slots;
  assert.ok(!after.includes(slots[0]) && !after.includes(overlapping));
  // Duration the mentor does not offer → field error
  r = await sam.post('/sessions', { mentorId: marcus.id, startsAt: after[0], duration: 20, type: 'video', topic: 'Odd length' });
  assert.equal(r.status, 400);

  // Lifecycle: student cannot confirm; mentor can; nobody can complete before start; link hidden until join window.
  assert.equal((await sam.patch(`/sessions/${booked.id}`, { status: 'confirmed' })).status, 409);
  const m = await login('marcus@example.com');
  r = await m.patch(`/sessions/${booked.id}`, { status: 'confirmed' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'confirmed'); assert.equal(r.body.meeting_url, undefined);
  r = await m.patch(`/sessions/${booked.id}`, { status: 'completed' });
  assert.equal(r.status, 409); assert.match(r.body.error, /after its start time/);
  r = await sam.patch(`/sessions/${booked.id}`, { status: 'cancelled', reason: 'Schedule changed' });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'cancelled');
});

test('request transitions are enforced', async () => {
  const sam = await login('sam@example.com');
  const elena = (await sam.get('/mentors')).body.find(m => m.name === 'Elena Ortiz');
  let r = await sam.post('/requests', { mentorId: elena.id, message: 'short' });
  assert.equal(r.status, 400);
  r = await sam.post('/requests', { mentorId: elena.id, message: 'Hi Elena, I want to learn about marketing careers.' });
  assert.equal(r.status, 201);
  const req = (await sam.get('/requests')).body.find(x => x.other_id === elena.id);
  assert.equal((await sam.del(`/requests/${req.id}`)).status, 200, 'student can withdraw a pending request');

  const maya = await login('maya@example.com');
  const priyaReq = (await maya.get('/requests')).body[0];
  const priya = await login('priya@example.com');
  assert.equal((await priya.patch(`/requests/${priyaReq.id}`, { status: 'accepted' })).status, 200);
  assert.equal((await priya.patch(`/requests/${priyaReq.id}`, { status: 'declined' })).status, 409, 'decided requests cannot be overwritten');
  assert.equal((await maya.del(`/requests/${priyaReq.id}`)).status, 409, 'accepted requests cannot be withdrawn');
});

test('capacity: a full or paused mentor cannot receive new requests', async () => {
  const marcus = await login('marcus@example.com');
  const prof = (await marcus.get('/profile')).body;
  await marcus.put('/profile', { ...prof, experience: prof.experience_list, education: prof.education_list, achievements: prof.achievements_list,
    durations: prof.durations_list, capacity: 1, accepting: true, offers_video: true, offers_chat: true });
  const maya = await login('maya@example.com');
  const mId = (await maya.get('/mentors')).body.find(m => m.name === 'Marcus Bell');
  assert.equal(mId.accepting, false);
  const r = await maya.post('/requests', { mentorId: mId.id, message: 'Hello Marcus, I would like advice on coding.' });
  assert.equal(r.status, 409);
  await marcus.put('/profile', { ...prof, experience: prof.experience_list, education: prof.education_list, achievements: prof.achievements_list,
    durations: prof.durations_list, capacity: 3, accepting: true, offers_video: true, offers_chat: true });
});

test('reviews: only completed sessions, rating required, no duplicates', async () => {
  const sam = await login('sam@example.com');
  const sessions = (await sam.get('/sessions')).body;
  const completed = sessions.find(s => s.status === 'completed');
  const upcoming = sessions.find(s => s.status === 'confirmed');
  assert.equal((await sam.post('/reviews', { sessionId: upcoming.id, rating: 5, comment: 'Great session overall!' })).status, 409);
  assert.equal((await sam.post('/reviews', { sessionId: completed.id, rating: 5, comment: 'Again and again!' })).status, 409, 'already reviewed');
  const m = await login('marcus@example.com');
  assert.equal((await m.post('/reviews', { sessionId: completed.id, comment: 'Great student, well prepared.' })).status, 400, 'rating required');
  assert.equal((await m.post('/reviews', { sessionId: completed.id, rating: 5, comment: 'Great student, well prepared.' })).status, 201);
});

test('reports: target must exist and be visible to the reporter; no duplicates', async () => {
  const sam = await login('sam@example.com');
  const marcus = (await sam.get('/mentors')).body.find(m => m.name === 'Marcus Bell');
  assert.equal((await sam.post('/flags', { targetType: 'user', targetId: 99999, reason: 'Other' })).status, 404);
  assert.equal((await sam.post('/flags', { targetType: 'message', targetId: 1, reason: 'Other' })).status, 404, 'cannot report a message you cannot see');
  assert.equal((await sam.post('/flags', { targetType: 'user', targetId: marcus.id, reason: 'Made up reason' })).status, 400);
  assert.equal((await sam.post('/flags', { targetType: 'user', targetId: marcus.id, reason: 'Spam or fake profile' })).status, 201);
  assert.equal((await sam.post('/flags', { targetType: 'user', targetId: marcus.id, reason: 'Spam or fake profile' })).status, 409);
});

test('admin: approvals, reasons for serious actions, permission checks', async () => {
  const sam = await login('sam@example.com');
  assert.equal((await sam.get('/admin/stats')).status, 403, 'students cannot reach admin');
  const admin = await login('admin@mentorshipmatch.org');
  const pending = (await admin.get('/admin/approvals')).body;
  const daniel = pending.find(p => p.name === 'Daniel Kim');
  assert.ok(daniel);
  assert.equal((await admin.patch(`/admin/approvals/${daniel.id}`, { decision: 'rejected' })).status, 400, 'rejection needs a reason');
  assert.equal((await admin.patch(`/admin/approvals/${daniel.id}`, { decision: 'approved', note: 'Verified LinkedIn and employer.' })).status, 200);
  assert.ok((await client().get('/public/mentors')).body.some(m => m.name === 'Daniel Kim'), 'approved mentor now listed');

  const flag = (await admin.get('/admin/flags?status=open')).body[0];
  const detail = (await admin.get(`/admin/flags/${flag.id}`)).body;
  assert.ok(detail.allowedActions.includes('dismiss'));
  assert.equal((await admin.patch(`/admin/flags/${flag.id}`, { action: 'suspend_author' })).status, 400, 'suspension needs a reason');
  assert.equal((await admin.patch(`/admin/flags/${flag.id}`, { action: 'dismiss', note: 'Not a violation.' })).status, 200);
  assert.equal((await admin.patch(`/admin/flags/${flag.id}`, { action: 'resolve' })).status, 409, 'closed reports stay closed');

  const kidId = await idOf(admin, 'kid@example.com');
  assert.equal((await admin.del(`/admin/users/${kidId}`, { reason: 'Test cleanup' })).status, 400, 'must type the name');
  assert.equal((await admin.del(`/admin/users/${kidId}`, { reason: 'Test cleanup', confirmName: 'Test Kid' })).status, 200);
  const audit = (await admin.get('/admin/audit')).body;
  assert.ok(audit.some(a => a.reason === 'Test cleanup'));
});

test('chat: append-only fetching with ?after=', async () => {
  const sam = await login('sam@example.com');
  const chat = (await sam.get('/sessions')).body.find(s => s.type === 'chat' && s.status === 'confirmed');
  const m1 = (await sam.post(`/sessions/${chat.id}/messages`, { body: 'Hello!' })).body;
  const m2 = (await sam.post(`/sessions/${chat.id}/messages`, { body: 'Second message' })).body;
  const newer = (await sam.get(`/sessions/${chat.id}/messages?after=${m1.id}`)).body;
  assert.deepEqual(newer.map(m => m.id), [m2.id]);
});
