// routes/admin.js — reporting (any user) and the administration panel (admins only):
// moderation queue with context, user management, mentor approvals, and the audit log.
const express = require('express');
const db = require('../db');
const { clean, fail, fieldError, requireAuth, requireRole, audit, isPublicMentor, parseExperience, lines, availabilitySummary } = require('../lib/helpers');

const router = express.Router();
router.use(requireAuth);

const REASONS = ['Inappropriate or offensive content', 'Harassment or bullying', 'Asking for personal contact info', 'Spam or fake profile', 'Other'];

// ---------- Reporting: validate the target exists and the reporter can actually see it ----------
function canSee(reporter, type, id) {
  if (type === 'user') {
    const u = db.prepare('SELECT id, role, status FROM users WHERE id=?').get(id);
    if (!u || u.id === reporter.id || u.status !== 'active') return false;
    if (u.role === 'mentor') return isPublicMentor(id) || !!db.prepare('SELECT 1 FROM mentorship_requests WHERE mentor_id=? AND mentee_id=?').get(id, reporter.id);
    if (u.role === 'mentee') return !!db.prepare('SELECT 1 FROM mentorship_requests WHERE mentee_id=? AND mentor_id=?').get(id, reporter.id);
    return false;
  }
  if (type === 'review') {
    const r = db.prepare('SELECT reviewer_id, reviewee_id, hidden FROM reviews WHERE id=?').get(id);
    return !!r && !r.hidden && r.reviewer_id !== reporter.id && (isPublicMentor(r.reviewee_id) || r.reviewee_id === reporter.id);
  }
  if (type === 'message') {
    const m = db.prepare('SELECT m.sender_id, s.mentee_id, s.mentor_id FROM messages m JOIN sessions_booked s ON s.id=m.session_id WHERE m.id=?').get(id);
    return !!m && m.sender_id !== reporter.id && (m.mentee_id === reporter.id || m.mentor_id === reporter.id);
  }
  return false;
}

router.post('/flags', (req, res) => {
  const type = req.body.targetType, id = Number(req.body.targetId);
  const reason = clean(req.body.reason, 60);
  if (!['user', 'review', 'message'].includes(type)) return fail(res, 400, 'Unknown report type.');
  if (!REASONS.includes(reason)) return fieldError(res, 'reason', 'Choose a reason for your report.');
  if (!canSee(req.user, type, id)) return fail(res, 404, 'That content could not be found.');
  if (db.prepare("SELECT 1 FROM flags WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'").get(req.user.id, type, id))
    return fail(res, 409, 'You already reported this. Our admin team will review it.');
  db.prepare('INSERT INTO flags (reporter_id, target_type, target_id, reason, details) VALUES (?,?,?,?,?)')
    .run(req.user.id, type, id, reason, clean(req.body.details, 500));
  res.status(201).json({ ok: true });
});

// ---------- Admin panel ----------
const admin = express.Router();
admin.use(requireRole('admin'));
const n = sql => db.prepare(sql).get().n;

admin.get('/stats', (req, res) => res.json({
  openFlags: n("SELECT COUNT(*) n FROM flags WHERE status='open'"),
  pendingApprovals: n("SELECT COUNT(*) n FROM users WHERE role='mentor' AND approval_status='pending'"),
  suspended: n("SELECT COUNT(*) n FROM users WHERE status='suspended'"),
  mentees: n("SELECT COUNT(*) n FROM users WHERE role='mentee'"),
  mentors: n("SELECT COUNT(*) n FROM users WHERE role='mentor' AND approval_status='approved'"),
  sessions: n('SELECT COUNT(*) n FROM sessions_booked'),
  completed: n("SELECT COUNT(*) n FROM sessions_booked WHERE status='completed'"),
}));

// Who wrote / owns the reported content (for "suspend author").
function authorOf(f) {
  if (f.target_type === 'user') return f.target_id;
  if (f.target_type === 'review') return db.prepare('SELECT reviewer_id AS id FROM reviews WHERE id=?').get(f.target_id)?.id;
  return db.prepare('SELECT sender_id AS id FROM messages WHERE id=?').get(f.target_id)?.id;
}
function flagSummary(f) {
  let preview = '(content deleted)';
  if (f.target_type === 'user') preview = db.prepare('SELECT name AS t FROM users WHERE id=?').get(f.target_id)?.t ?? preview;
  if (f.target_type === 'review') preview = db.prepare('SELECT comment AS t FROM reviews WHERE id=?').get(f.target_id)?.t ?? preview;
  if (f.target_type === 'message') preview = db.prepare('SELECT body AS t FROM messages WHERE id=?').get(f.target_id)?.t ?? preview;
  const author = authorOf(f);
  const a = author && db.prepare('SELECT id, name, role, status FROM users WHERE id=?').get(author);
  return { ...f, preview, author: a || null };
}

admin.get('/flags', (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : '';
  const type = ['user', 'review', 'message'].includes(req.query.type) ? req.query.type : '';
  const rows = db.prepare(`SELECT f.*, u.name AS reporter FROM flags f JOIN users u ON u.id=f.reporter_id
    WHERE (?='' OR f.status=?) AND (?='' OR f.target_type=?) ORDER BY f.status='open' DESC, f.created_at DESC LIMIT 300`)
    .all(status, status, type, type).map(flagSummary);
  const q = clean(req.query.q, 60).toLowerCase();
  res.json(q ? rows.filter(f => [f.reason, f.preview, f.reporter, f.author?.name, String(f.id)].join(' ').toLowerCase().includes(q)) : rows);
});

// Full case view with surrounding context.
admin.get('/flags/:id', (req, res) => {
  const f = db.prepare('SELECT f.*, u.name AS reporter, u.role AS reporter_role FROM flags f JOIN users u ON u.id=f.reporter_id WHERE f.id=?').get(Number(req.params.id));
  if (!f) return fail(res, 404, 'Report not found.');
  const out = flagSummary(f);
  if (f.target_type === 'message') {
    const m = db.prepare('SELECT * FROM messages WHERE id=?').get(f.target_id);
    if (m) {
      out.context = db.prepare(`SELECT m.id, m.body, m.created_at, u.name AS sender FROM messages m JOIN users u ON u.id=m.sender_id
        WHERE m.session_id=? AND m.id BETWEEN ? AND ? ORDER BY m.id`).all(m.session_id, m.id - 3, m.id + 3);
      out.session = db.prepare(`SELECT s.id, s.topic, s.starts_at, s.status, a.name AS mentee, b.name AS mentor FROM sessions_booked s
        JOIN users a ON a.id=s.mentee_id JOIN users b ON b.id=s.mentor_id WHERE s.id=?`).get(m.session_id);
    }
  }
  if (f.target_type === 'review') {
    out.review = db.prepare(`SELECT r.rating, r.comment, r.hidden, r.created_at, a.name AS reviewer, b.name AS reviewee FROM reviews r
      JOIN users a ON a.id=r.reviewer_id JOIN users b ON b.id=r.reviewee_id WHERE r.id=?`).get(f.target_id);
  }
  if (out.author) {
    out.authorHistory = {
      openReports: db.prepare("SELECT COUNT(*) n FROM flags WHERE status='open' AND target_type='user' AND target_id=?").get(out.author.id).n,
      created_at: db.prepare('SELECT created_at FROM users WHERE id=?').get(out.author.id)?.created_at,
    };
  }
  out.allowedActions = f.status !== 'open' ? [] :
    ['resolve', 'dismiss', ...(f.target_type !== 'user' ? ['hide_content'] : []), ...(out.author && out.author.role !== 'admin' && out.author.status === 'active' ? ['suspend_author'] : [])];
  res.json(out);
});

admin.patch('/flags/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM flags WHERE id=?').get(Number(req.params.id));
  if (!f) return fail(res, 404, 'Report not found.');
  if (f.status !== 'open') return fail(res, 409, `This report was already ${f.status}.`);
  const action = req.body.action, note = clean(req.body.note, 500);
  if (!['resolve', 'dismiss', 'hide_content', 'suspend_author'].includes(action)) return fail(res, 400, 'Unknown action.');
  if (['hide_content', 'suspend_author'].includes(action) && note.length < 5) return fieldError(res, 'note', 'Write a short reason (at least 5 characters) for this action.');
  if (action === 'hide_content') {
    if (f.target_type === 'review') db.prepare('UPDATE reviews SET hidden=1 WHERE id=?').run(f.target_id);
    else if (f.target_type === 'message') db.prepare("UPDATE messages SET body='[removed by a moderator]' WHERE id=?").run(f.target_id);
    else return fail(res, 400, 'Profiles cannot be hidden. Suspend the account instead.');
  }
  if (action === 'suspend_author') {
    const a = authorOf(f);
    if (!a) return fail(res, 404, 'The author no longer exists.');
    db.prepare("UPDATE users SET status='suspended' WHERE id=? AND role<>'admin'").run(a);
  }
  db.prepare("UPDATE flags SET status=?, resolution_note=?, resolved_by=?, resolved_at=datetime('now') WHERE id=?")
    .run(action === 'dismiss' ? 'dismissed' : 'resolved', note, req.user.id, f.id);
  audit(req.user.id, `Report #${f.id}: ${action.replace('_', ' ')}`, { reason: note, target: `${f.target_type} #${f.target_id}` });
  res.json({ ok: true });
});

// ---------- Users ----------
admin.get('/users', (req, res) => {
  const q = `%${clean(req.query.q, 60).toLowerCase()}%`;
  const role = ['mentee', 'mentor', 'admin'].includes(req.query.role) ? req.query.role : '';
  const status = ['active', 'suspended'].includes(req.query.status) ? req.query.status : '';
  res.json(db.prepare(`SELECT u.id, u.name, u.email, u.role, u.status, u.approval_status, u.created_at,
      (SELECT COUNT(*) FROM flags f WHERE f.target_type='user' AND f.target_id=u.id AND f.status='open') AS open_flags
    FROM users u WHERE (lower(u.name) LIKE ? OR lower(u.email) LIKE ?) AND (?='' OR u.role=?) AND (?='' OR u.status=?)
    ORDER BY u.created_at DESC LIMIT 500`).all(q, q, role, role, status, status));
});

admin.get('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id, name, email, role, status, approval_status, approval_note, created_at FROM users WHERE id=?').get(id);
  if (!u) return fail(res, 404, 'User not found.');
  const p = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(id) || {};
  res.json({
    ...u, profile: { ...p, experience_list: parseExperience(p.experience), education_list: lines(p.education) },
    counts: {
      sessions: db.prepare('SELECT COUNT(*) n FROM sessions_booked WHERE mentee_id=? OR mentor_id=?').get(id, id).n,
      reportsAgainst: db.prepare("SELECT COUNT(*) n FROM flags WHERE target_type='user' AND target_id=?").get(id).n,
      reportsFiled: db.prepare('SELECT COUNT(*) n FROM flags WHERE reporter_id=?').get(id).n,
    },
    history: db.prepare("SELECT action, reason, created_at FROM audit_log WHERE target=? ORDER BY id DESC LIMIT 20").all(`user #${id}`),
  });
});

admin.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id), status = req.body.status, reason = clean(req.body.reason, 500);
  if (!['active', 'suspended'].includes(status)) return fail(res, 400, 'Choose suspend or reactivate.');
  if (id === req.user.id) return fail(res, 400, 'You cannot change your own account status.');
  if (reason.length < 5) return fieldError(res, 'reason', 'Write a short reason (at least 5 characters).');
  const r = db.prepare("UPDATE users SET status=? WHERE id=? AND role<>'admin'").run(status, id);
  if (!r.changes) return fail(res, 404, 'User not found.');
  audit(req.user.id, status === 'suspended' ? 'Suspended account' : 'Reactivated account', { reason, target: `user #${id}` });
  res.json({ ok: true });
});

admin.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id), reason = clean(req.body?.reason, 500);
  const u = db.prepare("SELECT name FROM users WHERE id=? AND role<>'admin'").get(id);
  if (!u) return fail(res, 404, 'User not found.');
  if (reason.length < 5) return fieldError(res, 'reason', 'Write a short reason (at least 5 characters).');
  if (clean(req.body?.confirmName, 80) !== u.name) return fieldError(res, 'confirmName', `Type the account name exactly (${u.name}) to confirm.`);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  audit(req.user.id, `Deleted account (${u.name})`, { reason, target: `user #${id}` });
  res.json({ ok: true });
});

// ---------- Mentor approvals ----------
admin.get('/approvals', (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.created_at, u.approval_status, p.* FROM users u JOIN profiles p ON p.user_id=u.id
    WHERE u.role='mentor' AND u.approval_status='pending' ORDER BY u.created_at`).all();
  res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, created_at: r.created_at, headline: r.headline, organization: r.organization,
    industry: r.industry, years_experience: r.years_experience, bio: r.bio, interests: r.interests, skills: r.skills,
    experience_list: parseExperience(r.experience), education_list: lines(r.education), availability: availabilitySummary(r.id) })));
});
admin.patch('/approvals/:id', (req, res) => {
  const id = Number(req.params.id), decision = req.body.decision, note = clean(req.body.note, 500);
  if (!['approved', 'rejected'].includes(decision)) return fail(res, 400, 'Choose approve or reject.');
  if (decision === 'rejected' && note.length < 5) return fieldError(res, 'note', 'Explain why (at least 5 characters). The applicant will see this.');
  const r = db.prepare("UPDATE users SET approval_status=?, approval_note=? WHERE id=? AND role='mentor' AND approval_status='pending'").run(decision, note, id);
  if (!r.changes) return fail(res, 409, 'This application was already decided or does not exist.');
  audit(req.user.id, decision === 'approved' ? 'Approved mentor application' : 'Rejected mentor application', { reason: note, target: `user #${id}` });
  res.json({ ok: true });
});

admin.get('/audit', (req, res) => {
  res.json(db.prepare(`SELECT a.id, a.action, a.reason, a.target, a.created_at, u.name AS admin FROM audit_log a
    LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 200`).all());
});

router.use('/admin', admin);
module.exports = router;
