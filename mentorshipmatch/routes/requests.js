// routes/requests.js — mentorship requests and accepted connections (My mentors / My mentees).
// Valid transitions (enforced here, not just in the UI):
//   (none) → pending            student sends a request (mentor must be approved, accepting, and below capacity)
//   pending → accepted|declined mentor decides once; a decided request cannot be changed again
//   pending → (withdrawn)       student withdraws; the row is removed so they could ask again later
const express = require('express');
const db = require('../db');
const { clean, fail, fieldError, requireAuth, requireRole, mentorCapacity, isPublicMentor } = require('../lib/helpers');

const router = express.Router();
router.use(requireAuth);

router.post('/requests', requireRole('mentee'), (req, res) => {
  const mentorId = Number(req.body.mentorId), message = clean(req.body.message, 600);
  if (!isPublicMentor(mentorId)) return fail(res, 404, 'Mentor not found.');
  if (message.length < 20) return fieldError(res, 'message', 'Write a short introduction (at least 20 characters) so the mentor knows how to help.');
  const existing = db.prepare('SELECT status FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(req.user.id, mentorId);
  if (existing) return fail(res, 409, existing.status === 'declined'
    ? 'This mentor declined an earlier request. Try another mentor who matches your interests.'
    : 'You have already sent this mentor a request.');
  const cap = mentorCapacity(mentorId);
  if (!cap.accepting) return fail(res, 409, cap.paused ? 'This mentor has paused new requests right now.' : 'This mentor is at capacity right now.');
  db.prepare('INSERT INTO mentorship_requests (mentee_id, mentor_id, message) VALUES (?,?,?)').run(req.user.id, mentorId, message);
  res.status(201).json({ ok: true });
});

router.get('/requests', (req, res) => {
  if (req.user.role === 'mentor') {
    return res.json(db.prepare(`SELECT r.id, r.status, r.message, r.created_at, r.responded_at, r.mentee_id AS other_id, u.name AS other_name,
        p.grade_level, p.industry, p.interests, p.career_goals, p.organization
      FROM mentorship_requests r JOIN users u ON u.id=r.mentee_id LEFT JOIN profiles p ON p.user_id=r.mentee_id
      WHERE r.mentor_id=? AND u.status='active' ORDER BY r.created_at DESC`).all(req.user.id));
  }
  if (req.user.role === 'mentee') {
    return res.json(db.prepare(`SELECT r.id, r.status, r.message, r.created_at, r.responded_at, r.mentor_id AS other_id, u.name AS other_name,
        p.headline, p.organization, p.industry
      FROM mentorship_requests r JOIN users u ON u.id=r.mentor_id LEFT JOIN profiles p ON p.user_id=r.mentor_id
      WHERE r.mentee_id=? ORDER BY r.created_at DESC`).all(req.user.id));
  }
  res.json([]);
});

router.patch('/requests/:id', requireRole('mentor'), (req, res) => {
  const status = req.body.status;
  if (!['accepted', 'declined'].includes(status)) return fail(res, 400, 'Choose accept or decline.');
  const r = db.prepare('SELECT * FROM mentorship_requests WHERE id=? AND mentor_id=?').get(Number(req.params.id), req.user.id);
  if (!r) return fail(res, 404, 'Request not found.');
  if (r.status !== 'pending') return fail(res, 409, `This request was already ${r.status}.`);
  if (req.user.approval_status !== 'approved') return fail(res, 403, 'Your mentor account is still waiting for approval.');
  if (status === 'accepted' && mentorCapacity(req.user.id).full) return fail(res, 409, 'You are at your mentee capacity. Raise your capacity in My profile or decline.');
  db.prepare("UPDATE mentorship_requests SET status=?, responded_at=datetime('now') WHERE id=? AND status='pending'").run(status, r.id);
  res.json({ ok: true, status });
});

router.delete('/requests/:id', requireRole('mentee'), (req, res) => {
  const r = db.prepare('SELECT status FROM mentorship_requests WHERE id=? AND mentee_id=?').get(Number(req.params.id), req.user.id);
  if (!r) return fail(res, 404, 'Request not found.');
  if (r.status !== 'pending') return fail(res, 409, 'Only requests that are still awaiting a response can be withdrawn.');
  db.prepare("DELETE FROM mentorship_requests WHERE id=? AND status='pending'").run(Number(req.params.id));
  res.json({ ok: true });
});

// Counts of things that need the user's attention (shown as badges in the sidebar).
router.get('/counts', (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  const now = new Date().toISOString();
  if (req.user.role === 'mentor') return res.json({
    requests: one("SELECT COUNT(*) n FROM mentorship_requests WHERE mentor_id=? AND status='pending'", req.user.id),
    sessions: one("SELECT COUNT(*) n FROM sessions_booked WHERE mentor_id=? AND status='requested' AND starts_at > ?", req.user.id, now),
  });
  if (req.user.role === 'mentee') return res.json({
    sessions: one(`SELECT COUNT(*) n FROM sessions_booked s WHERE s.mentee_id=? AND s.status='completed'
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.session_id=s.id AND r.reviewer_id=?)`, req.user.id, req.user.id),
  });
  res.json({
    flags: one("SELECT COUNT(*) n FROM flags WHERE status='open'"),
    approvals: one("SELECT COUNT(*) n FROM users WHERE role='mentor' AND approval_status='pending'"),
  });
});

// Accepted relationships with useful context for "My mentors" / "My mentees".
router.get('/connections', (req, res) => {
  if (!['mentor', 'mentee'].includes(req.user.role)) return res.json([]);
  const mentor = req.user.role === 'mentor';
  const [me, other] = mentor ? ['mentor_id', 'mentee_id'] : ['mentee_id', 'mentor_id'];
  const rows = db.prepare(`SELECT u.id, u.name, p.headline, p.organization, p.industry, p.grade_level, p.interests, p.career_goals,
      p.offers_video, p.offers_chat, r.responded_at AS connected_at
    FROM mentorship_requests r JOIN users u ON u.id=r.${other} LEFT JOIN profiles p ON p.user_id=u.id
    WHERE r.${me}=? AND r.status='accepted' AND u.status='active' ORDER BY u.name`).all(req.user.id);
  const next = db.prepare(`SELECT id, starts_at, topic, type, status FROM sessions_booked
    WHERE ${me}=? AND ${other}=? AND status IN ('requested','confirmed') AND ends_at > ? ORDER BY starts_at LIMIT 1`);
  const done = db.prepare(`SELECT COUNT(*) n FROM sessions_booked WHERE ${me}=? AND ${other}=? AND status='completed'`);
  const nowIso = new Date().toISOString();
  res.json(rows.map(r => ({
    ...r, offers_video: !!r.offers_video, offers_chat: !!r.offers_chat,
    // Students see mentors' professional details; mentors see students' educational context only.
    ...(mentor ? { headline: undefined, organization: undefined } : { grade_level: undefined, career_goals: undefined }),
    nextSession: next.get(req.user.id, r.id, nowIso) || null, completedSessions: done.get(req.user.id, r.id).n,
  })));
});

module.exports = router;
