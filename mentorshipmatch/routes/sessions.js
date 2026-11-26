// routes/sessions.js — booking, the session lifecycle, chat messages, and reviews.
//
// Lifecycle (validated on the server):
//   requested → confirmed      mentor only, before the start time
//   requested → cancelled      either participant (mentor declining = cancel with a reason)
//   confirmed → cancelled      either participant, before the start time
//   confirmed → completed      either participant, only AFTER the session's start time
// Reviews: only for completed sessions, only by a participant, at most one per person per session.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { clean, fail, fieldError, requireAuth, requireRole, isPublicMentor, slotsFor, durationsOf } = require('../lib/helpers');

const router = express.Router();
router.use(requireAuth);

const JOIN_EARLY_MS = 15 * 60000, JOIN_LATE_MS = 15 * 60000;
const getSession = id => db.prepare('SELECT * FROM sessions_booked WHERE id=?').get(Number(id));
const isParticipant = (s, uid) => s && (s.mentee_id === uid || s.mentor_id === uid);

function shape(s, me) {
  const now = Date.now(), start = Date.parse(s.starts_at), end = Date.parse(s.ends_at);
  const otherId = me.id === s.mentor_id ? s.mentee_id : s.mentor_id;
  const other = db.prepare('SELECT u.id, u.name, p.headline, p.grade_level, p.organization FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?').get(otherId) || {};
  const reviewed = !!db.prepare('SELECT 1 FROM reviews WHERE session_id=? AND reviewer_id=?').get(s.id, me.id);
  const canJoin = s.status === 'confirmed' && s.type === 'video' && now >= start - JOIN_EARLY_MS && now <= end + JOIN_LATE_MS;
  return {
    id: s.id, topic: s.topic, type: s.type, duration: s.duration, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status,
    myRole: me.id === s.mentor_id ? 'mentor' : 'mentee',
    other: { id: other.id, name: other.name, detail: me.id === s.mentor_id ? other.grade_level : other.headline },
    cancel_reason: s.cancel_reason, cancelledByMe: s.cancelled_by === me.id,
    reviewed,
    canConfirm: s.status === 'requested' && me.id === s.mentor_id && start > now,
    canCancel: ['requested', 'confirmed'].includes(s.status) && start > now,
    canComplete: s.status === 'confirmed' && now >= start,
    canReview: s.status === 'completed' && !reviewed,
    canChat: s.type === 'chat' && ['confirmed', 'completed'].includes(s.status),
    canJoin, joinOpensAt: s.type === 'video' && s.status === 'confirmed' ? new Date(start - JOIN_EARLY_MS).toISOString() : null,
    meeting_url: canJoin ? s.meeting_url : undefined, // only revealed during the join window
  };
}

// ---------- Book ----------
router.post('/sessions', requireRole('mentee'), (req, res) => {
  const mentorId = Number(req.body.mentorId);
  const type = req.body.type === 'chat' ? 'chat' : req.body.type === 'video' ? 'video' : null;
  const duration = Number(req.body.duration);
  const topic = clean(req.body.topic, 150);
  const startMs = Date.parse(req.body.startsAt);
  if (!isPublicMentor(mentorId)) return fail(res, 404, 'Mentor not found.');
  if (!db.prepare("SELECT 1 FROM mentorship_requests WHERE mentee_id=? AND mentor_id=? AND status='accepted'").get(req.user.id, mentorId))
    return fail(res, 403, 'A mentor must accept your request before you can book a session.');
  const p = db.prepare('SELECT offers_video, offers_chat, durations FROM profiles WHERE user_id=?').get(mentorId);
  if (!durationsOf(p).includes(duration)) return fieldError(res, 'duration', 'Choose a session length this mentor offers.');
  if (!type || (type === 'video' && !p.offers_video) || (type === 'chat' && !p.offers_chat)) return fieldError(res, 'type', 'Choose a session format this mentor offers.');
  if (topic.length < 5) return fieldError(res, 'topic', 'Describe what you want to talk about (at least 5 characters).');
  if (!Number.isFinite(startMs) || !String(req.body.startsAt).endsWith('Z')) return fieldError(res, 'startsAt', 'Choose a time from the list.');

  // Check availability and overlaps inside one immediate transaction, so two simultaneous
  // requests cannot both take the same time.
  db.exec('BEGIN IMMEDIATE');
  try {
    const free = slotsFor(mentorId, duration, req.user.id, { days: 60 });
    if (!free.includes(startMs)) {
      db.exec('ROLLBACK');
      return fail(res, 409, 'That time is no longer available. It may overlap another session for you or your mentor. Please pick another time.', { field: 'startsAt' });
    }
    const start = new Date(startMs).toISOString(), end = new Date(startMs + duration * 60000).toISOString();
    const r = db.prepare(`INSERT INTO sessions_booked (mentee_id, mentor_id, starts_at, ends_at, duration, type, topic)
      VALUES (?,?,?,?,?,?,?)`).run(req.user.id, mentorId, start, end, duration, type, topic);
    db.exec('COMMIT');
    res.status(201).json(shape(getSession(r.lastInsertRowid), req.user));
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
});

router.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions_booked WHERE mentee_id=? OR mentor_id=? ORDER BY starts_at').all(req.user.id, req.user.id);
  res.json(rows.map(s => shape(s, req.user)));
});

router.get('/sessions/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  res.json(shape(s, req.user));
});

router.patch('/sessions/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  const info = shape(s, req.user);
  const status = req.body.status;
  const allowed = { confirmed: info.canConfirm, cancelled: info.canCancel, completed: info.canComplete };
  if (!(status in allowed)) return fail(res, 400, 'Unknown change.');
  if (!allowed[status]) {
    const why = status === 'completed' && s.status === 'confirmed' ? 'A session can be marked complete only after its start time.'
      : status === 'confirmed' && req.user.id !== s.mentor_id ? 'Only the mentor can confirm a session.'
      : `This session is ${s.status} and cannot be changed that way.`;
    return fail(res, 409, why);
  }
  if (status === 'confirmed') {
    const url = s.type === 'video' ? `https://meet.jit.si/MentorshipMatch-${crypto.randomBytes(8).toString('hex')}` : '';
    db.prepare("UPDATE sessions_booked SET status='confirmed', meeting_url=? WHERE id=? AND status='requested'").run(url, s.id);
  } else if (status === 'cancelled') {
    db.prepare("UPDATE sessions_booked SET status='cancelled', cancelled_by=?, cancel_reason=? WHERE id=? AND status IN ('requested','confirmed')")
      .run(req.user.id, clean(req.body.reason, 200), s.id);
  } else {
    db.prepare("UPDATE sessions_booked SET status='completed' WHERE id=? AND status='confirmed'").run(s.id);
  }
  res.json(shape(getSession(s.id), req.user));
});

// ---------- Chat (append-only: clients ask only for messages after the last id they have) ----------
router.get('/sessions/:id/messages', (req, res) => {
  const s = getSession(req.params.id);
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  const after = Math.max(0, Number(req.query.after) || 0);
  res.json(db.prepare(`SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender FROM messages m
    JOIN users u ON u.id=m.sender_id WHERE m.session_id=? AND m.id>? ORDER BY m.id LIMIT 200`).all(s.id, after));
});
router.post('/sessions/:id/messages', (req, res) => {
  const s = getSession(req.params.id);
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  if (s.type !== 'chat' || s.status !== 'confirmed') return fail(res, 409, 'Chat is open only for confirmed chat sessions.');
  const body = clean(req.body.body, 1000);
  if (!body) return fieldError(res, 'body', 'Message cannot be empty.');
  const r = db.prepare('INSERT INTO messages (session_id, sender_id, body) VALUES (?,?,?)').run(s.id, req.user.id, body);
  res.status(201).json(db.prepare(`SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(r.lastInsertRowid));
});

// ---------- Reviews ----------
router.post('/reviews', (req, res) => {
  const s = getSession(req.body.sessionId);
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  if (s.status !== 'completed') return fail(res, 409, 'You can review a session after it is completed.');
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fieldError(res, 'rating', 'Select a rating from 1 to 5.');
  const comment = clean(req.body.comment, 800);
  if (comment.length < 10) return fieldError(res, 'comment', 'Write at least one sentence (10 or more characters).');
  const reviewee = req.user.id === s.mentee_id ? s.mentor_id : s.mentee_id;
  try {
    db.prepare('INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating, comment) VALUES (?,?,?,?,?)').run(s.id, req.user.id, reviewee, rating, comment);
  } catch { return fail(res, 409, 'You already reviewed this session.'); }
  res.status(201).json({ ok: true });
});

module.exports = router;
