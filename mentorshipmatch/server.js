// server.js — MentorshipMatch REST API + static front end
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Security middleware ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts. Try again in 15 minutes.' } });

// ---------- Helpers ----------
const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fail = (res, code, error) => res.status(code).json({ error });

function requireAuth(req, res, next) {
  if (!req.session.userId) return fail(res, 401, 'Please log in.');
  const user = db.prepare('SELECT id,name,email,role,status FROM users WHERE id=?').get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return fail(res, 401, 'Please log in.'); }
  if (user.status === 'suspended') return fail(res, 403, 'Your account has been suspended. Contact support.');
  req.user = user;
  next();
}
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : fail(res, 403, 'You do not have permission to do that.');

function publicProfile(userId) {
  const u = db.prepare(`SELECT u.id,u.name,u.role,u.created_at,p.* FROM users u
    LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active'`).get(userId);
  if (!u) return null;
  const r = db.prepare('SELECT ROUND(AVG(rating),1) AS avg, COUNT(*) AS n FROM reviews WHERE reviewee_id=? AND hidden=0').get(userId);
  return { ...u, rating: r.avg, reviewCount: r.n };
}
const isParticipant = (s, uid) => s && (s.mentee_id === uid || s.mentor_id === uid);
const audit = (adminId, action) => db.prepare('INSERT INTO audit_log (admin_id,action) VALUES (?,?)').run(adminId, action);

// ---------- Auth ----------
app.post('/api/auth/register', authLimiter, (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = req.body.role === 'mentor' ? 'mentor' : 'mentee';
  if (name.length < 2) return fail(res, 400, 'Please enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 400, 'Please enter a valid email address.');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return fail(res, 400, 'Password must be at least 8 characters and include a letter and a number.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 409, 'An account with that email already exists.');

  const { lastInsertRowid } = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 12), role);
  const id = Number(lastInsertRowid);
  db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(id);
  req.session.regenerate(() => { req.session.userId = id; res.status(201).json({ id, name, email, role }); });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash))
    return fail(res, 401, 'Incorrect email or password.');
  if (user.status === 'suspended') return fail(res, 403, 'Your account has been suspended. Contact support.');
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/auth/me', (req, res) => {
  const u = req.session.userId && db.prepare("SELECT id,name,email,role FROM users WHERE id=? AND status='active'").get(req.session.userId);
  res.json(u || null);
});

// ---------- Profiles ----------
app.get('/api/profile', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM profiles WHERE user_id=?').get(req.user.id) || {});
});
app.put('/api/profile', requireAuth, (req, res) => {
  const b = req.body;
  const name = clean(b.name, 80);
  if (name.length < 2) return fail(res, 400, 'Name is required.');
  const interests = clean(b.interests, 300).split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 12).join(',');
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name, req.user.id);
  const skills = clean(b.skills, 300).split(',').map(s => s.trim()).filter(Boolean).slice(0, 15).join(',');
  const years = Math.max(0, Math.min(60, parseInt(b.years_experience, 10) || 0));
  db.prepare(`UPDATE profiles SET headline=?,bio=?,organization=?,grade_level=?,industry=?,interests=?,career_goals=?,availability=?,
    experience=?,education=?,skills=?,achievements=?,years_experience=? WHERE user_id=?`).run(clean(b.headline, 100), clean(b.bio, 1000),
    clean(b.organization, 100), clean(b.grade_level, 40), clean(b.industry, 60), interests, clean(b.career_goals, 600),
    clean(b.availability, 100), clean(b.experience, 1500), clean(b.education, 600), skills, clean(b.achievements, 800), years, req.user.id);
  res.json({ ok: true });
});
app.get('/api/users/:id', requireAuth, (req, res) => {
  const p = publicProfile(Number(req.params.id));
  if (!p) return fail(res, 404, 'Profile not found.');
  // Only show mentees' profiles to their connected mentors (privacy for minors)
  if (p.role === 'mentee' && req.user.id !== p.id && req.user.role !== 'admin') {
    const linked = db.prepare('SELECT 1 FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(p.id, req.user.id);
    if (!linked) return fail(res, 403, 'Student profiles are private.');
  }
  p.reviews = db.prepare(`SELECT r.id,r.rating,r.comment,r.created_at,u.name AS reviewer FROM reviews r
    JOIN users u ON u.id=r.reviewer_id WHERE r.reviewee_id=? AND r.hidden=0 ORDER BY r.created_at DESC`).all(p.id);
  if (req.user.role === 'mentee') {
    p.myRequest = db.prepare('SELECT status FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(req.user.id, p.id) || null;
  }
  res.json(p);
});

// ---------- Public (no login): home page mentors + stats ----------
// Only mentor (adult professional) data is public; student data never is.
app.get('/api/public/mentors', (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 4));
  const rows = db.prepare(`SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.role='mentor' AND u.status='active' ORDER BY (p.experience<>'') DESC, u.id LIMIT ?`).all(limit);
  res.json(rows.map(r => publicProfile(r.id)).map(({ user_id, ...m }) => m));
});
app.get('/api/public/mentors/:id', (req, res) => {
  const m = db.prepare("SELECT 1 FROM users WHERE id=? AND role='mentor' AND status='active'").get(Number(req.params.id));
  if (!m) return fail(res, 404, 'Mentor not found.');
  const { user_id, ...p } = publicProfile(Number(req.params.id));
  res.json(p);
});
app.get('/api/public/stats', (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  res.json({
    mentors: n("SELECT COUNT(*) n FROM users WHERE role='mentor' AND status='active'"),
    industries: n("SELECT COUNT(DISTINCT p.industry) n FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.role='mentor' AND p.industry<>''"),
    sessions: n("SELECT COUNT(*) n FROM sessions_booked WHERE status IN ('confirmed','completed')"),
  });
});

// ---------- Browse mentors ----------
app.get('/api/mentors', requireAuth, (req, res) => {
  const q = `%${clean(req.query.q, 60).toLowerCase()}%`;
  const industry = clean(req.query.industry, 60);
  const rows = db.prepare(`SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.role='mentor' AND u.status='active'
      AND (lower(u.name) LIKE ? OR lower(p.headline) LIKE ? OR lower(p.interests) LIKE ? OR lower(p.organization) LIKE ?)
      AND (? = '' OR p.industry = ?)
    ORDER BY u.name`).all(q, q, q, q, industry, industry);
  res.json(rows.map(r => publicProfile(r.id)));
});
app.get('/api/industries', requireAuth, (req, res) => {
  res.json(db.prepare(`SELECT DISTINCT p.industry FROM profiles p JOIN users u ON u.id=p.user_id
    WHERE u.role='mentor' AND p.industry<>'' ORDER BY p.industry`).all().map(r => r.industry));
});

// ---------- Mentorship requests ----------
app.post('/api/requests', requireAuth, requireRole('mentee'), (req, res) => {
  const mentorId = Number(req.body.mentorId), message = clean(req.body.message, 600);
  const mentor = db.prepare("SELECT id FROM users WHERE id=? AND role='mentor' AND status='active'").get(mentorId);
  if (!mentor) return fail(res, 404, 'Mentor not found.');
  if (message.length < 10) return fail(res, 400, 'Please write a short introduction (at least 10 characters).');
  try {
    db.prepare('INSERT INTO mentorship_requests (mentee_id,mentor_id,message) VALUES (?,?,?)').run(req.user.id, mentorId, message);
  } catch { return fail(res, 409, 'You have already sent this mentor a request.'); }
  res.status(201).json({ ok: true });
});
app.get('/api/requests', requireAuth, (req, res) => {
  const col = req.user.role === 'mentor' ? 'mentor_id' : 'mentee_id';
  res.json(db.prepare(`SELECT r.*, me.name AS mentee_name, mo.name AS mentor_name FROM mentorship_requests r
    JOIN users me ON me.id=r.mentee_id JOIN users mo ON mo.id=r.mentor_id
    WHERE r.${col}=? ORDER BY r.status='pending' DESC, r.created_at DESC`).all(req.user.id));
});
app.patch('/api/requests/:id', requireAuth, requireRole('mentor'), (req, res) => {
  const status = req.body.status;
  if (!['accepted', 'declined'].includes(status)) return fail(res, 400, 'Invalid status.');
  const r = db.prepare('UPDATE mentorship_requests SET status=? WHERE id=? AND mentor_id=?').run(status, Number(req.params.id), req.user.id);
  if (!r.changes) return fail(res, 404, 'Request not found.');
  res.json({ ok: true });
});

// ---------- Session booking ----------
app.get('/api/connections', requireAuth, (req, res) => {
  // People you have an accepted mentorship with (used to populate the booking form)
  const [me, other] = req.user.role === 'mentor' ? ['mentor_id', 'mentee_id'] : ['mentee_id', 'mentor_id'];
  res.json(db.prepare(`SELECT u.id,u.name FROM mentorship_requests r JOIN users u ON u.id=r.${other}
    WHERE r.${me}=? AND r.status='accepted' AND u.status='active' ORDER BY u.name`).all(req.user.id));
});
app.post('/api/sessions', requireAuth, requireRole('mentee'), (req, res) => {
  const mentorId = Number(req.body.mentorId), startsAt = clean(req.body.startsAt, 20);
  const type = req.body.type === 'chat' ? 'chat' : 'video', topic = clean(req.body.topic, 150);
  const duration = [30, 45, 60].includes(Number(req.body.duration)) ? Number(req.body.duration) : 30;
  const ok = db.prepare("SELECT 1 FROM mentorship_requests WHERE mentee_id=? AND mentor_id=? AND status='accepted'").get(req.user.id, mentorId);
  if (!ok) return fail(res, 403, 'You can only book sessions with mentors who accepted your request.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) || new Date(startsAt) <= new Date())
    return fail(res, 400, 'Please choose a date and time in the future.');
  if (topic.length < 3) return fail(res, 400, 'Please add a topic for the session.');
  const clash = db.prepare(`SELECT 1 FROM sessions_booked WHERE mentor_id=? AND starts_at=? AND status IN ('requested','confirmed')`).get(mentorId, startsAt);
  if (clash) return fail(res, 409, 'That mentor already has a session at that time. Please pick another slot.');
  db.prepare('INSERT INTO sessions_booked (mentee_id,mentor_id,starts_at,duration,type,topic) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, mentorId, startsAt, duration, type, topic);
  res.status(201).json({ ok: true });
});
app.get('/api/sessions', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT s.*, me.name AS mentee_name, mo.name AS mentor_name,
      (SELECT 1 FROM reviews r WHERE r.session_id=s.id AND r.reviewer_id=?) AS reviewed
    FROM sessions_booked s JOIN users me ON me.id=s.mentee_id JOIN users mo ON mo.id=s.mentor_id
    WHERE s.mentee_id=? OR s.mentor_id=? ORDER BY s.starts_at`).all(req.user.id, req.user.id, req.user.id);
  res.json(rows);
});
app.patch('/api/sessions/:id', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions_booked WHERE id=?').get(Number(req.params.id));
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  const { status } = req.body;
  const allowed = {
    confirmed: req.user.id === s.mentor_id && s.status === 'requested',
    cancelled: ['requested', 'confirmed'].includes(s.status),
    completed: s.status === 'confirmed',
  };
  if (!allowed[status]) return fail(res, 400, 'That change is not allowed for this session.');
  const url = status === 'confirmed' && s.type === 'video'
    ? `https://meet.jit.si/MentorshipMatch-${crypto.randomBytes(6).toString('hex')}` : s.meeting_url;
  db.prepare('UPDATE sessions_booked SET status=?, meeting_url=? WHERE id=?').run(status, url, s.id);
  res.json({ ok: true });
});

// ---------- Chat messages (per session) ----------
app.get('/api/sessions/:id/messages', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions_booked WHERE id=?').get(Number(req.params.id));
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  res.json(db.prepare(`SELECT m.id,m.body,m.created_at,m.sender_id,u.name AS sender FROM messages m
    JOIN users u ON u.id=m.sender_id WHERE m.session_id=? ORDER BY m.id`).all(s.id));
});
app.post('/api/sessions/:id/messages', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions_booked WHERE id=?').get(Number(req.params.id));
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  if (s.status !== 'confirmed') return fail(res, 400, 'Chat opens once the session is confirmed.');
  const body = clean(req.body.body, 1000);
  if (!body) return fail(res, 400, 'Message cannot be empty.');
  db.prepare('INSERT INTO messages (session_id,sender_id,body) VALUES (?,?,?)').run(s.id, req.user.id, body);
  res.status(201).json({ ok: true });
});

// ---------- Reviews ----------
app.post('/api/reviews', requireAuth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions_booked WHERE id=?').get(Number(req.body.sessionId));
  if (!isParticipant(s, req.user.id)) return fail(res, 404, 'Session not found.');
  if (s.status !== 'completed') return fail(res, 400, 'You can review a session after it is completed.');
  const rating = Math.round(Number(req.body.rating)), comment = clean(req.body.comment, 800);
  if (!(rating >= 1 && rating <= 5)) return fail(res, 400, 'Choose a rating from 1 to 5.');
  if (comment.length < 10) return fail(res, 400, 'Please write at least a sentence (10+ characters).');
  const reviewee = req.user.id === s.mentee_id ? s.mentor_id : s.mentee_id;
  try {
    db.prepare('INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating,comment) VALUES (?,?,?,?,?)')
      .run(s.id, req.user.id, reviewee, rating, comment);
  } catch { return fail(res, 409, 'You already reviewed this session.'); }
  res.status(201).json({ ok: true });
});

// ---------- Flagging (any user can report) ----------
app.post('/api/flags', requireAuth, (req, res) => {
  const targetType = ['user', 'review', 'message'].includes(req.body.targetType) ? req.body.targetType : null;
  const reason = clean(req.body.reason, 60);
  if (!targetType || !reason) return fail(res, 400, 'Please choose a reason.');
  db.prepare('INSERT INTO flags (reporter_id,target_type,target_id,reason,details) VALUES (?,?,?,?,?)')
    .run(req.user.id, targetType, Number(req.body.targetId), reason, clean(req.body.details, 500));
  res.status(201).json({ ok: true });
});

// ---------- Admin panel ----------
const admin = express.Router();
admin.use(requireAuth, requireRole('admin'));
admin.get('/stats', (req, res) => {
  const n = sql => db.prepare(sql).get().n;
  res.json({
    mentors: n("SELECT COUNT(*) n FROM users WHERE role='mentor'"),
    mentees: n("SELECT COUNT(*) n FROM users WHERE role='mentee'"),
    sessions: n('SELECT COUNT(*) n FROM sessions_booked'),
    completed: n("SELECT COUNT(*) n FROM sessions_booked WHERE status='completed'"),
    openFlags: n("SELECT COUNT(*) n FROM flags WHERE status='open'"),
    suspended: n("SELECT COUNT(*) n FROM users WHERE status='suspended'"),
  });
});
admin.get('/users', (req, res) => {
  res.json(db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,
    (SELECT COUNT(*) FROM flags f WHERE f.target_type='user' AND f.target_id=u.id AND f.status='open') AS open_flags
    FROM users u ORDER BY u.created_at DESC`).all());
});
admin.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id), status = req.body.status;
  if (!['active', 'suspended'].includes(status)) return fail(res, 400, 'Invalid status.');
  if (id === req.user.id) return fail(res, 400, 'You cannot suspend your own account.');
  const r = db.prepare("UPDATE users SET status=? WHERE id=? AND role<>'admin'").run(status, id);
  if (!r.changes) return fail(res, 404, 'User not found.');
  audit(req.user.id, `${status === 'suspended' ? 'Suspended' : 'Reactivated'} user #${id}`);
  res.json({ ok: true });
});
admin.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare("DELETE FROM users WHERE id=? AND role<>'admin'").run(id);
  if (!r.changes) return fail(res, 404, 'User not found.');
  audit(req.user.id, `Deleted user #${id}`);
  res.json({ ok: true });
});
admin.get('/flags', (req, res) => {
  const flags = db.prepare(`SELECT f.*, u.name AS reporter FROM flags f JOIN users u ON u.id=f.reporter_id
    ORDER BY f.status='open' DESC, f.created_at DESC`).all();
  for (const f of flags) {
    if (f.target_type === 'user') f.preview = db.prepare('SELECT name AS text FROM users WHERE id=?').get(f.target_id)?.text;
    if (f.target_type === 'review') f.preview = db.prepare('SELECT comment AS text FROM reviews WHERE id=?').get(f.target_id)?.text;
    if (f.target_type === 'message') f.preview = db.prepare('SELECT body AS text FROM messages WHERE id=?').get(f.target_id)?.text;
    f.preview = f.preview ?? '(content deleted)';
  }
  res.json(flags);
});
admin.patch('/flags/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM flags WHERE id=?').get(Number(req.params.id));
  if (!f) return fail(res, 404, 'Flag not found.');
  const { action } = req.body; // dismiss | resolve | hide_content | suspend_user
  if (action === 'hide_content' && f.target_type === 'review') db.prepare('UPDATE reviews SET hidden=1 WHERE id=?').run(f.target_id);
  if (action === 'hide_content' && f.target_type === 'message') db.prepare("UPDATE messages SET body='[removed by moderator]' WHERE id=?").run(f.target_id);
  if (action === 'suspend_user' && f.target_type === 'user') db.prepare("UPDATE users SET status='suspended' WHERE id=? AND role<>'admin'").run(f.target_id);
  db.prepare('UPDATE flags SET status=? WHERE id=?').run(action === 'dismiss' ? 'dismissed' : 'resolved', f.id);
  audit(req.user.id, `Flag #${f.id} (${f.target_type} #${f.target_id}): ${action}`);
  res.json({ ok: true });
});
admin.get('/audit', (req, res) => {
  res.json(db.prepare(`SELECT a.*, u.name AS admin FROM audit_log a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 50`).all());
});
app.use('/api/admin', admin);

// SPA fallback + JSON 404 for unknown API routes
app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); fail(res, 500, 'Something went wrong. Please try again.'); });

app.listen(PORT, () => console.log(`MentorshipMatch running at http://localhost:${PORT}`));
