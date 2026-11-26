// routes/profiles.js — your own profile, mentor availability, and viewing other people's profiles.
const express = require('express');
const db = require('../db');
const { clean, fail, fieldError, tagList, lineList, experienceList, parseExperience, lines, requireAuth, requireRole,
  mentorCapacity, availabilitySummary, publicReviews, ratingOf, durationsOf, isPublicMentor } = require('../lib/helpers');
const { isValidTimeZone, toMinutes } = require('../lib/time');

const router = express.Router();
router.use(requireAuth);

// Profile completion is based on clearly defined fields (spec §16), not an arbitrary number.
const COMPLETION = {
  mentee: [
    ['organization', 'School'], ['grade_level', 'Grade or year'], ['industry', 'Field of interest'],
    ['interests', 'Academic interests'], ['career_goals', 'Career goals'], ['bio', 'About you'],
  ],
  mentor: [
    ['headline', 'Job title'], ['organization', 'Employer'], ['industry', 'Industry'], ['interests', 'Topics you can help with'],
    ['bio', 'How you can help'], ['experience', 'Work experience'], ['education', 'Education'], ['skills', 'Skills'],
    ['mentoring_style', 'Mentoring style'], ['availability', 'Weekly availability'],
  ],
};
function completion(user, p, availCount) {
  const list = COMPLETION[user.role];
  if (!list) return null;
  const missing = list.filter(([k]) => (k === 'availability' ? !availCount : !String(p[k] || '').trim())).map(([k, label]) => ({ key: k, label }));
  return { percent: Math.round(((list.length - missing.length) / list.length) * 100), missing };
}

function ownProfile(user) {
  const p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(user.id) || {};
  const availability = user.role === 'mentor' ? availabilitySummary(user.id) : [];
  return {
    ...p, name: user.name, email: user.email, role: user.role, approval_status: user.approval_status,
    experience_list: parseExperience(p.experience), education_list: lines(p.education), achievements_list: lines(p.achievements),
    durations_list: durationsOf(p), availability, completion: completion(user, p, availability.length),
    capacityInfo: user.role === 'mentor' ? mentorCapacity(user.id) : null,
  };
}

router.get('/profile', (req, res) => res.json(ownProfile(req.user)));

router.put('/profile', (req, res) => {
  const b = req.body, role = req.user.role;
  const name = clean(b.name, 80);
  if (name.length < 2) return fieldError(res, 'name', 'Enter your full name.');
  const fields = {
    headline: clean(b.headline, 100), bio: clean(b.bio, 1000), organization: clean(b.organization, 100),
    industry: clean(b.industry, 60), interests: tagList(b.interests),
  };
  if (role === 'mentee') Object.assign(fields, {
    grade_level: clean(b.grade_level, 40), career_goals: clean(b.career_goals, 600),
    preferred_format: ['video', 'chat'].includes(b.preferred_format) ? b.preferred_format : 'either',
  });
  if (role === 'mentor') {
    const durations = (Array.isArray(b.durations) ? b.durations : String(b.durations || '').split(','))
      .map(Number).filter(d => [30, 45, 60].includes(d));
    if (!durations.length) return fieldError(res, 'durations', 'Offer at least one session length.');
    const offersVideo = b.offers_video ? 1 : 0, offersChat = b.offers_chat ? 1 : 0;
    if (!offersVideo && !offersChat) return fieldError(res, 'offers', 'Offer at least one session type.');
    if (b.timezone && !isValidTimeZone(b.timezone)) return fieldError(res, 'timezone', 'Choose a valid time zone.');
    Object.assign(fields, {
      years_experience: Math.max(0, Math.min(60, parseInt(b.years_experience, 10) || 0)),
      experience: experienceList(b.experience), education: lineList(b.education, 6), skills: tagList(b.skills, 15),
      achievements: lineList(b.achievements, 8), mentoring_style: clean(b.mentoring_style, 400),
      capacity: Math.max(1, Math.min(10, parseInt(b.capacity, 10) || 3)), accepting: b.accepting ? 1 : 0,
      offers_video: offersVideo, offers_chat: offersChat, durations: [...new Set(durations)].sort((a, c) => a - c).join(','),
      timezone: b.timezone || 'America/Chicago',
    });
  }
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.user.id);
  const cols = Object.keys(fields);
  db.prepare(`UPDATE profiles SET ${cols.map(c => `${c}=?`).join(',')} WHERE user_id=?`).run(...cols.map(c => fields[c]), req.user.id);
  res.json(ownProfile({ ...req.user, name }));
});

// Quick pause/resume of new requests from the mentor dashboard.
router.patch('/profile/accepting', requireRole('mentor'), (req, res) => {
  db.prepare('UPDATE profiles SET accepting=? WHERE user_id=?').run(req.body.accepting ? 1 : 0, req.user.id);
  res.json(mentorCapacity(req.user.id));
});

// Weekly availability: [{weekday 0-6, start "HH:MM", end "HH:MM"}] in the mentor's time zone.
router.put('/profile/availability', requireRole('mentor'), (req, res) => {
  const list = Array.isArray(req.body.windows) ? req.body.windows.slice(0, 30) : null;
  if (!list) return fieldError(res, 'windows', 'Send a list of availability windows.');
  const parsed = [];
  for (const w of list) {
    const weekday = Number(w.weekday), s = toMinutes(w.start), e = toMinutes(w.end) ?? (w.end === '24:00' ? 1440 : null);
    if (!(weekday >= 0 && weekday <= 6) || s == null || e == null) return fieldError(res, 'windows', 'Each time needs a day, a start, and an end.');
    if (e - s < 30) return fieldError(res, 'windows', 'Each window must be at least 30 minutes long and end after it starts.');
    if (parsed.some(p => p.weekday === weekday && s < p.e && p.s < e)) return fieldError(res, 'windows', 'Two windows on the same day overlap. Combine them into one.');
    parsed.push({ weekday, s, e });
  }
  if (req.body.timezone) {
    if (!isValidTimeZone(req.body.timezone)) return fieldError(res, 'timezone', 'Choose a valid time zone.');
    db.prepare('UPDATE profiles SET timezone=? WHERE user_id=?').run(req.body.timezone, req.user.id);
  }
  db.prepare('DELETE FROM availability WHERE mentor_id=?').run(req.user.id);
  const ins = db.prepare('INSERT INTO availability (mentor_id, weekday, start_min, end_min) VALUES (?,?,?,?)');
  for (const p of parsed) ins.run(req.user.id, p.weekday, p.s, p.e);
  res.json({ ok: true, availability: availabilitySummary(req.user.id) });
});

// View someone's profile. Mentors: visible to everyone logged in once approved.
// Students: private — only the student, mentors they contacted, and admins can see them.
router.get('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id, name, role, status, approval_status, created_at FROM users WHERE id=?').get(id);
  if (!u || (u.status !== 'active' && req.user.role !== 'admin')) return fail(res, 404, 'Profile not found.');
  const p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(id) || {};
  const self = req.user.id === id;

  if (u.role === 'mentee') {
    const linked = db.prepare('SELECT status FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(id, req.user.id);
    if (!self && req.user.role !== 'admin' && !linked) return fail(res, 403, 'Student profiles are private.');
    return res.json({
      id, name: u.name, role: 'mentee', created_at: u.created_at, headline: p.headline, bio: p.bio, organization: p.organization,
      grade_level: p.grade_level, industry: p.industry, interests: p.interests, career_goals: p.career_goals, preferred_format: p.preferred_format,
      relationship: linked ? linked.status : null,
    });
  }
  if (u.role === 'mentor' && !self && req.user.role !== 'admin' && !isPublicMentor(id)) return fail(res, 404, 'Profile not found.');

  const out = {
    id, name: u.name, role: u.role, created_at: u.created_at, approval_status: self || req.user.role === 'admin' ? u.approval_status : undefined,
    headline: p.headline, bio: p.bio, organization: p.organization, industry: p.industry, interests: p.interests, skills: p.skills,
    years_experience: p.years_experience, mentoring_style: p.mentoring_style, timezone: p.timezone,
    experience_list: parseExperience(p.experience), education_list: lines(p.education), achievements_list: lines(p.achievements),
    offers_video: !!p.offers_video, offers_chat: !!p.offers_chat, durations_list: durationsOf(p),
    availability: availabilitySummary(id), ...ratingOf(id), reviews: publicReviews(id),
  };
  if (u.role === 'mentor') {
    const cap = mentorCapacity(id);
    out.accepting = cap.accepting; out.paused = cap.paused; out.full = cap.full;
  }
  if (req.user.role === 'mentee' && u.role === 'mentor') {
    const r = db.prepare('SELECT id, status, created_at FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(req.user.id, id);
    out.relationship = r ? r.status : 'none';
    out.requestId = r?.id;
    out.saved = !!db.prepare('SELECT 1 FROM saved_mentors WHERE mentee_id=? AND mentor_id=?').get(req.user.id, id);
  }
  res.json(out);
});

module.exports = router;
