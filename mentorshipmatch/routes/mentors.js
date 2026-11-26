// routes/mentors.js — mentor discovery (directory, filters, sorting), recommendations,
// saved mentors, bookable time slots, and the public (logged-out) mentor pages.
const express = require('express');
const db = require('../db');
const { clean, fail, requireAuth, requireRole, mentorCard, MENTOR_SELECT, isPublicMentor, slotsFor, durationsOf,
  parseExperience, lines, ratingOf, publicReviews, availabilitySummary, mentorCapacity } = require('../lib/helpers');

const router = express.Router();

function searchMentors({ q = '', industry = '', format = '', available = false, sort = 'relevance', limit = 60 }, viewer) {
  const like = `%${clean(q, 60).toLowerCase()}%`;
  let rows = db.prepare(`${MENTOR_SELECT}
      AND (lower(u.name) LIKE ? OR lower(p.headline) LIKE ? OR lower(p.interests) LIKE ? OR lower(p.skills) LIKE ?
           OR lower(p.organization) LIKE ? OR lower(p.bio) LIKE ? OR lower(p.industry) LIKE ?)
      AND (? = '' OR p.industry = ?)
      AND (? = '' OR (? = 'video' AND p.offers_video = 1) OR (? = 'chat' AND p.offers_chat = 1))
    ORDER BY u.name`).all(like, like, like, like, like, like, like, industry, industry, format, format, format).slice(0, 200);
  let cards = rows.map(r => mentorCard(r, viewer));
  if (available) cards = cards.filter(c => c.accepting && c.nextAvailable);
  const byName = (a, b) => a.name.localeCompare(b.name);
  const sorters = {
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.reviewCount - a.reviewCount || byName(a, b),
    experience: (a, b) => b.years_experience - a.years_experience || byName(a, b),
    soonest: (a, b) => (a.nextAvailable ? Date.parse(a.nextAvailable) : Infinity) - (b.nextAvailable ? Date.parse(b.nextAvailable) : Infinity) || byName(a, b),
    relevance: (a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1) || Number(b.accepting) - Number(a.accepting) || byName(a, b),
  };
  return cards.sort(sorters[sort] || sorters.relevance).slice(0, limit);
}

// ---------- Logged-in directory ----------
router.get('/mentors', requireAuth, (req, res) => {
  const { q, industry, format, available, sort } = req.query;
  res.json(searchMentors({ q, industry: clean(industry, 60), format: ['video', 'chat'].includes(format) ? format : '',
    available: available === '1', sort: clean(sort, 20) }, req.user));
});

router.get('/industries', requireAuth, (req, res) => res.json(industries().map(i => i.industry)));

// Explainable recommendations for students: only eligible mentors (approved, active, accepting,
// not already connected), ranked by the transparent score in lib/matching.js.
router.get('/recommendations', requireAuth, requireRole('mentee'), (req, res) => {
  const cards = searchMentors({ sort: 'relevance' }, req.user)
    .filter(c => c.accepting && c.relationship === 'none' && c.match.score !== null && c.match.score > 0);
  const p = db.prepare('SELECT interests, industry, career_goals FROM profiles WHERE user_id=?').get(req.user.id) || {};
  const missing = [!p.interests && 'academic interests', !p.industry && 'field of interest', !p.career_goals && 'career goals'].filter(Boolean);
  res.json({ mentors: cards.slice(0, Number(req.query.limit) || 3), missing });
});

// ---------- Saved mentors ----------
router.get('/saved', requireAuth, requireRole('mentee'), (req, res) => {
  const rows = db.prepare(`${MENTOR_SELECT} AND u.id IN (SELECT mentor_id FROM saved_mentors WHERE mentee_id=?) ORDER BY u.name`).all(req.user.id);
  res.json(rows.map(r => mentorCard(r, req.user)));
});
router.put('/saved/:id', requireAuth, requireRole('mentee'), (req, res) => {
  const id = Number(req.params.id);
  if (!isPublicMentor(id)) return fail(res, 404, 'Mentor not found.');
  db.prepare('INSERT OR IGNORE INTO saved_mentors (mentee_id, mentor_id) VALUES (?,?)').run(req.user.id, id);
  res.json({ saved: true });
});
router.delete('/saved/:id', requireAuth, requireRole('mentee'), (req, res) => {
  db.prepare('DELETE FROM saved_mentors WHERE mentee_id=? AND mentor_id=?').run(req.user.id, Number(req.params.id));
  res.json({ saved: false });
});

// ---------- Bookable time slots (UTC ISO strings; the browser shows them in local time) ----------
router.get('/mentors/:id/slots', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!isPublicMentor(id)) return fail(res, 404, 'Mentor not found.');
  const p = db.prepare('SELECT durations, timezone FROM profiles WHERE user_id=?').get(id);
  const duration = Number(req.query.duration) || 30;
  if (!durationsOf(p).includes(duration)) return fail(res, 400, 'This mentor does not offer that session length.');
  const studentId = req.user.role === 'mentee' ? req.user.id : null;
  const slots = slotsFor(id, duration, studentId, { days: 42 }).map(ms => new Date(ms).toISOString());
  res.json({ timezone: p.timezone, duration, slots });
});

// ---------- Public (no login) ----------
function industries() {
  return db.prepare(`SELECT p.industry, COUNT(*) AS count FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.role='mentor' AND u.status='active' AND u.approval_status='approved' AND p.industry<>'' GROUP BY p.industry ORDER BY p.industry`).all();
}
router.get('/public/industries', (req, res) => res.json(industries()));

router.get('/public/mentors', (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 60));
  const { q, industry, format, sort, available } = req.query;
  res.json(searchMentors({ q, industry: clean(industry, 60), format: ['video', 'chat'].includes(format) ? format : '',
    available: available === '1', sort: ['rating', 'experience', 'soonest'].includes(sort) ? sort : 'rating', limit }, null));
});

router.get('/public/mentors/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!isPublicMentor(id)) return fail(res, 404, 'Mentor not found.');
  const u = db.prepare('SELECT id, name, created_at FROM users WHERE id=?').get(id);
  const p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(id);
  const cap = mentorCapacity(id);
  res.json({
    id, name: u.name, role: 'mentor', created_at: u.created_at, headline: p.headline, bio: p.bio, organization: p.organization,
    industry: p.industry, interests: p.interests, skills: p.skills, years_experience: p.years_experience, mentoring_style: p.mentoring_style,
    experience_list: parseExperience(p.experience), education_list: lines(p.education), achievements_list: lines(p.achievements),
    offers_video: !!p.offers_video, offers_chat: !!p.offers_chat, durations_list: durationsOf(p), timezone: p.timezone,
    availability: availabilitySummary(id), accepting: cap.accepting, ...ratingOf(id), reviews: publicReviews(id),
  });
});

router.get('/public/stats', (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  res.json({
    mode: db.MODE,
    mentors: n("SELECT COUNT(*) n FROM users WHERE role='mentor' AND status='active' AND approval_status='approved'"),
    industries: industries().length,
    sessions: n("SELECT COUNT(*) n FROM sessions_booked WHERE status IN ('confirmed','completed')"),
  });
});

module.exports = router;
