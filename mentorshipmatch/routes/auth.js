// routes/auth.js — registration (guided onboarding), login, logout, password change.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { clean, fail, fieldError, tagList, lineList, experienceList, requireAuth } = require('../lib/helpers');
const { isValidTimeZone } = require('../lib/time');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many attempts. Try again in 15 minutes.' } });

const HIGH_SCHOOL = ['9th grade', '10th grade', '11th grade', '12th grade'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const passwordProblem = pw => (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw))
  ? 'Use at least 8 characters, including a letter and a number.' : null;

// POST /api/auth/register — one submission at the end of the multi-step onboarding.
router.post('/register', authLimiter, (req, res) => {
  const b = req.body, p = b.profile || {};
  const role = b.role === 'mentor' ? 'mentor' : 'mentee';
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (name.length < 2) return fieldError(res, 'name', 'Enter your full name.');
  if (!EMAIL_RE.test(email)) return fieldError(res, 'email', 'Enter a valid email address, like name@example.com.');
  const pw = passwordProblem(password);
  if (pw) return fieldError(res, 'password', pw);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fieldError(res, 'email', 'An account with this email already exists. Try logging in.');
  if (!b.agree) return fieldError(res, 'agree', 'Please agree to the Community Guidelines to continue.');

  const industry = clean(p.industry, 60);
  const interests = tagList(p.interests);
  let profile;
  if (role === 'mentee') {
    const grade = clean(p.grade_level, 40);
    if (!grade) return fieldError(res, 'grade_level', 'Choose your current grade or year.');
    if (HIGH_SCHOOL.includes(grade) && !b.guardianAck) return fieldError(res, 'guardianAck', 'High school students need a parent or guardian to know they are using MentorshipMatch.');
    if (!interests) return fieldError(res, 'interests', 'Add at least one academic interest.');
    profile = {
      organization: clean(p.organization, 100), grade_level: grade, industry, interests,
      career_goals: clean(p.career_goals, 600), preferred_format: ['video', 'chat'].includes(p.preferred_format) ? p.preferred_format : 'either',
      guardian_ack_at: b.guardianAck ? new Date().toISOString() : null,
    };
  } else {
    if (!clean(p.headline, 100)) return fieldError(res, 'headline', 'Enter your job title.');
    if (!industry) return fieldError(res, 'industry', 'Choose your industry.');
    if (!interests) return fieldError(res, 'interests', 'Add at least one topic you can help with.');
    const tz = isValidTimeZone(p.timezone) ? p.timezone : 'America/Chicago';
    profile = {
      headline: clean(p.headline, 100), organization: clean(p.organization, 100), industry, interests,
      years_experience: Math.max(0, Math.min(60, parseInt(p.years_experience, 10) || 0)),
      experience: experienceList(p.experience), education: lineList(p.education, 6), skills: tagList(p.skills, 15),
      bio: clean(p.bio, 1000), capacity: Math.max(1, Math.min(10, parseInt(p.capacity, 10) || 3)), timezone: tz,
      offers_video: p.offers_video === false ? 0 : 1, offers_chat: p.offers_chat === false ? 0 : 1,
    };
    if (!profile.offers_video && !profile.offers_chat) return fieldError(res, 'offers', 'Offer at least one session type.');
  }

  const { lastInsertRowid } = db.prepare('INSERT INTO users (name,email,password_hash,role,approval_status) VALUES (?,?,?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 12), role, role === 'mentor' ? 'pending' : 'approved');
  const id = Number(lastInsertRowid);
  const cols = Object.keys(profile);
  db.prepare(`INSERT INTO profiles (user_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`).run(id, ...cols.map(c => profile[c]));
  req.session.regenerate(() => {
    req.session.userId = id;
    res.status(201).json({ id, name, email, role, approval_status: role === 'mentor' ? 'pending' : 'approved' });
  });
});

router.post('/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  if (!email) return fieldError(res, 'email', 'Enter your email address.');
  if (!req.body.password) return fieldError(res, 'password', 'Enter your password.');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password), user.password_hash))
    return fieldError(res, 'password', 'That email and password combination is not correct.');
  if (user.status === 'suspended') return fail(res, 403, 'Your account has been suspended. Contact support.');
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, approval_status: user.approval_status });
  });
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

router.get('/me', (req, res) => {
  const u = req.session.userId && db.prepare("SELECT id,name,email,role,approval_status FROM users WHERE id=? AND status='active'").get(req.session.userId);
  res.json(u || null);
});

router.post('/password', requireAuth, (req, res) => {
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(req.body.current || ''), u.password_hash)) return fieldError(res, 'current', 'Your current password is not correct.');
  const pw = passwordProblem(String(req.body.next || ''));
  if (pw) return fieldError(res, 'next', pw);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(req.body.next), 12), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
