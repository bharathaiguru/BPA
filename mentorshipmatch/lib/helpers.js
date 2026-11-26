// lib/helpers.js — shared server helpers: validation, auth guards, mentor data shaping.
const db = require('../db');
const { generateSlots, fromMinutes } = require('./time');
const { scoreMatch } = require('./matching');

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fail = (res, code, error, extra = {}) => res.status(code).json({ error, ...extra });
// Field-specific validation error: the front end shows `message` next to the `field` input.
const fieldError = (res, field, message) => res.status(400).json({ error: message, field });

// Accept either an array or a comma-separated string; return a clean comma-separated string.
function tagList(v, maxItems = 12, maxLen = 40) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(arr.map(x => clean(String(x), maxLen)).filter(Boolean))].slice(0, maxItems).join(',');
}
// Accept an array of strings or newline text; return newline text.
function lineList(v, maxItems = 10, maxLen = 160) {
  const arr = Array.isArray(v) ? v : String(v || '').split('\n');
  return arr.map(x => clean(String(x).replace(/\|/g, '/'), maxLen)).filter(Boolean).slice(0, maxItems).join('\n');
}
// Structured experience [{title, org, years}] → stored "Title | Organization | Years" lines.
function experienceList(v) {
  if (!Array.isArray(v)) return lineList(v, 10, 200);
  return v.map(e => [clean(e?.title, 80), clean(e?.org, 80), clean(e?.years, 30)].map(x => x.replace(/\|/g, '/')))
    .filter(([t]) => t).slice(0, 10).map(parts => parts.join(' | ')).join('\n');
}
const parseExperience = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => { const [title = '', org = '', years = ''] = l.split('|').map(x => x.trim()); return { title, org, years }; });
const lines = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean);

function requireAuth(req, res, next) {
  if (!req.session.userId) return fail(res, 401, 'Please log in.');
  const user = db.prepare('SELECT id,name,email,role,status,approval_status FROM users WHERE id=?').get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return fail(res, 401, 'Please log in.'); }
  if (user.status === 'suspended') return fail(res, 403, 'Your account has been suspended. Contact support.');
  req.user = user;
  next();
}
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : fail(res, 403, 'You do not have permission to do that.');

function audit(adminId, action, { reason = '', target = '' } = {}) {
  db.prepare('INSERT INTO audit_log (admin_id, action, reason, target) VALUES (?,?,?,?)').run(adminId, action, reason, target);
}

// ---------- Mentor state ----------
const activeMenteeCount = mentorId => db.prepare(`SELECT COUNT(*) n FROM mentorship_requests r JOIN users u ON u.id=r.mentee_id
  WHERE r.mentor_id=? AND r.status='accepted' AND u.status='active'`).get(mentorId).n;

function mentorCapacity(mentorId) {
  const p = db.prepare('SELECT capacity, accepting FROM profiles WHERE user_id=?').get(mentorId) || {};
  const active = activeMenteeCount(mentorId);
  const capacity = p.capacity || 3;
  return { active, capacity, paused: !p.accepting, full: active >= capacity, accepting: !!p.accepting && active < capacity };
}

const isPublicMentor = id => !!db.prepare("SELECT 1 FROM users WHERE id=? AND role='mentor' AND status='active' AND approval_status='approved'").get(id);

const availabilityOf = mentorId => db.prepare('SELECT weekday, start_min, end_min FROM availability WHERE mentor_id=? ORDER BY weekday, start_min').all(mentorId);

// Requested + confirmed sessions as [startMs, endMs] for one or more users.
function busyIntervals(userIds) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return [];
  const q = `SELECT starts_at, ends_at FROM sessions_booked WHERE status IN ('requested','confirmed')
    AND (${ids.map(() => 'mentor_id=? OR mentee_id=?').join(' OR ')})`;
  return db.prepare(q).all(...ids.flatMap(id => [id, id])).map(s => [Date.parse(s.starts_at), Date.parse(s.ends_at)]);
}

function slotsFor(mentorId, duration, studentId, opts = {}) {
  const p = db.prepare('SELECT timezone FROM profiles WHERE user_id=?').get(mentorId) || {};
  return generateSlots(availabilityOf(mentorId), p.timezone || 'America/Chicago', duration, busyIntervals([mentorId, studentId]), opts);
}

function ratingOf(userId) {
  const r = db.prepare('SELECT ROUND(AVG(rating),1) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id=? AND hidden=0').get(userId);
  return { rating: r.avg, reviewCount: r.n };
}

const durationsOf = p => String(p.durations || '30,45,60').split(',').map(Number).filter(d => [30, 45, 60].includes(d));

// Shape a mentor for directory cards / public pages. Never includes email.
function mentorCard(row, viewer) {
  const cap = mentorCapacity(row.id);
  const slots = slotsFor(row.id, 30, viewer?.role === 'mentee' ? viewer.id : null, { days: 21 });
  const card = {
    id: row.id, name: row.name, headline: row.headline, organization: row.organization, industry: row.industry,
    summary: String(row.bio || '').slice(0, 160), interests: row.interests, skills: row.skills,
    years_experience: row.years_experience || 0, offers_video: !!row.offers_video, offers_chat: !!row.offers_chat,
    accepting: cap.accepting, nextAvailable: slots.length ? new Date(slots[0]).toISOString() : null,
    ...ratingOf(row.id),
  };
  if (viewer?.role === 'mentee') {
    const sp = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(viewer.id) || {};
    card.match = scoreMatch(sp, row);
    card.saved = !!db.prepare('SELECT 1 FROM saved_mentors WHERE mentee_id=? AND mentor_id=?').get(viewer.id, row.id);
    const r = db.prepare('SELECT status FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(viewer.id, row.id);
    card.relationship = r ? r.status : 'none';
  }
  return card;
}

const MENTOR_SELECT = `SELECT u.id, u.name, u.created_at, p.* FROM users u JOIN profiles p ON p.user_id=u.id
  WHERE u.role='mentor' AND u.status='active' AND u.approval_status='approved'`;

// Reviews shown publicly never reveal the student's name (many students are minors).
function publicReviews(mentorId) {
  return db.prepare(`SELECT r.id, r.rating, r.comment, r.created_at, p.grade_level FROM reviews r
    LEFT JOIN profiles p ON p.user_id=r.reviewer_id
    WHERE r.reviewee_id=? AND r.hidden=0 ORDER BY r.created_at DESC`).all(mentorId)
    .map(r => ({ id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
      reviewer: r.grade_level ? `Student mentee · ${r.grade_level}` : 'Student mentee' }));
}

const availabilitySummary = mentorId => availabilityOf(mentorId).map(w => ({ weekday: w.weekday, start: fromMinutes(w.start_min), end: fromMinutes(w.end_min) }));

module.exports = {
  clean, fail, fieldError, tagList, lineList, experienceList, parseExperience, lines, requireAuth, requireRole, audit,
  activeMenteeCount, mentorCapacity, isPublicMentor, availabilityOf, busyIntervals, slotsFor, ratingOf, durationsOf,
  mentorCard, MENTOR_SELECT, publicReviews, availabilitySummary,
};
