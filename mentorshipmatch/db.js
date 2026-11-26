// db.js — database schema + demo seed data (SQLite via Node's built-in node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'mentorshipmatch.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mentee','mentor','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline      TEXT DEFAULT '',
  bio           TEXT DEFAULT '',
  organization  TEXT DEFAULT '',   -- school (mentee) or employer (mentor)
  grade_level   TEXT DEFAULT '',   -- mentee: e.g. "11th grade", "College sophomore"
  industry      TEXT DEFAULT '',
  interests     TEXT DEFAULT '',   -- comma-separated tags
  career_goals  TEXT DEFAULT '',
  availability  TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS mentorship_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mentee_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mentee_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS sessions_booked (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mentee_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at   TEXT NOT NULL,
  duration    INTEGER NOT NULL DEFAULT 30,
  type        TEXT NOT NULL CHECK (type IN ('video','chat')),
  topic       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled')),
  meeting_url TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions_booked(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions_booked(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, reviewer_id)
);
CREATE TABLE IF NOT EXISTS flags (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('user','review','message')),
  target_id    INTEGER NOT NULL,
  reason       TEXT NOT NULL,
  details      TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- Migration: résumé fields (safe to run on older databases) ----------
const profileCols = db.prepare('PRAGMA table_info(profiles)').all().map(c => c.name);
for (const col of ['education', 'experience', 'skills', 'achievements', 'years_experience']) {
  if (!profileCols.includes(col)) {
    db.exec(`ALTER TABLE profiles ADD COLUMN ${col} ${col === 'years_experience' ? 'INTEGER DEFAULT 0' : "TEXT DEFAULT ''"}`);
  }
}

// Demo résumés. Experience/education/achievements use one entry per line;
// experience lines are "Title | Organization | Years".
const DEMO_RESUMES = {
  'priya@example.com': {
    years: 12,
    experience: 'Pediatric Physician | Children\'s Health Partners | 2017–present\nChief Resident, Pediatrics | University Medical Center | 2016–2017\nPediatrics Resident | University Medical Center | 2013–2016',
    education: 'M.D. — University of Texas Southwestern Medical School\nB.S. Biology — Rice University',
    skills: 'pediatrics,patient care,clinical research,MCAT prep,public speaking',
    achievements: 'Board Certified, American Board of Pediatrics\nPublished 6 peer-reviewed articles on childhood asthma\nVolunteer physician, Dallas free clinic (8 years)',
  },
  'marcus@example.com': {
    years: 10,
    experience: 'Senior Software Engineer | Northwind Tech | 2020–present\nSoftware Engineer | Brightline Payments | 2016–2020\nSoftware Engineering Intern | Brightline Payments | Summer 2015',
    education: 'B.S. Computer Science — University of Texas at Dallas',
    skills: 'JavaScript,Node.js,React,SQL,system design,code review',
    achievements: 'Led rebuild of a checkout system used by 2M+ customers\nMentor, Girls Who Code Dallas chapter\nSpeaker, DFW JavaScript Meetup',
  },
  'elena@example.com': {
    years: 9,
    experience: 'Marketing Director | Bright Lane Agency | 2021–present\nSocial Media Manager | Lone Star Coffee Co. | 2018–2021\nMarketing Coordinator | Frisco RoughRiders | 2016–2018',
    education: 'B.B.A. Marketing — Texas A&M University',
    skills: 'brand strategy,social media,content creation,analytics,Adobe Creative Suite',
    achievements: 'Grew a client\'s Instagram audience from 4K to 120K\nAmerican Marketing Association member\nGuest lecturer, high school DECA chapters',
  },
  'james@example.com': {
    years: 14,
    experience: 'Senior Civil Engineer | Midwest Infrastructure Group | 2015–present\nProject Engineer | Texas Department of Transportation | 2011–2015',
    education: 'M.S. Civil Engineering — Texas Tech University\nB.S. Civil Engineering — Texas Tech University (first-generation graduate)',
    skills: 'structural design,AutoCAD,project management,surveying,bridge inspection',
    achievements: 'Licensed Professional Engineer (P.E.), Texas\nLead engineer on a 1.2-mile highway bridge replacement\nASCE Young Engineer of the Year (2016)',
  },
  'aisha@example.com': {
    years: 11,
    experience: 'Partner, Corporate Law | Khan & Lowe LLP | 2020–present\nAssociate Attorney | Harmon Reed LLP | 2014–2020\nLaw Clerk | U.S. District Court, N.D. Texas | 2013–2014',
    education: 'J.D. — SMU Dedman School of Law\nB.A. Political Science — University of North Texas',
    skills: 'contract law,negotiation,legal writing,public policy,debate',
    achievements: 'Texas Super Lawyers "Rising Star" (2019–2022)\nState debate finalist in high school\nPro bono counsel for two youth nonprofits',
  },
};
function applyDemoResumes() {
  const upd = db.prepare(`UPDATE profiles SET experience=?, education=?, skills=?, achievements=?, years_experience=?
    WHERE user_id=(SELECT id FROM users WHERE email=?) AND (experience IS NULL OR experience='')`);
  for (const [email, r] of Object.entries(DEMO_RESUMES)) upd.run(r.experience, r.education, r.skills, r.achievements, r.years, email);
}

// ---------- Seed demo data (only when the database is empty) ----------
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const hash = bcrypt.hashSync('Password123!', 10);
  const addUser = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
  const addProfile = db.prepare(`INSERT INTO profiles
    (user_id,headline,bio,organization,grade_level,industry,interests,career_goals,availability)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  const people = [
    ['Admin Team', 'admin@mentorshipmatch.org', 'admin', ['Platform Administrator', '', 'MentorshipMatch', '', '', '', '', '']],
    ['Dr. Priya Raman', 'priya@example.com', 'mentor', ['Pediatric Physician', 'I help students explore pre-med paths, MCAT planning, and what life in medicine actually looks like.', 'Children\'s Health Partners', '', 'Healthcare', 'medicine,biology,pre-med,research', '', 'Weekday evenings']],
    ['Marcus Bell', 'marcus@example.com', 'mentor', ['Senior Software Engineer', 'Ten years building web apps. Happy to review projects, talk internships, and demystify CS degrees vs. bootcamps.', 'Northwind Tech', '', 'Technology', 'software,web development,computer science,internships', '', 'Tue/Thu afternoons']],
    ['Elena Ortiz', 'elena@example.com', 'mentor', ['Marketing Director', 'Brand strategy, social media careers, and building a portfolio before college.', 'Bright Lane Agency', '', 'Business & Marketing', 'marketing,business,social media,entrepreneurship', '', 'Weekends']],
    ['James Whitfield', 'james@example.com', 'mentor', ['Civil Engineer, P.E.', 'Infrastructure, bridges, and getting into engineering programs. First-gen college grad.', 'Midwest Infrastructure Group', '', 'Engineering', 'engineering,math,physics,first-gen', '', 'Mon/Wed evenings']],
    ['Aisha Khan', 'aisha@example.com', 'mentor', ['Corporate Attorney', 'Law school admissions, debate-to-law pipeline, and careers in public policy.', 'Khan & Lowe LLP', '', 'Law & Government', 'law,policy,debate,writing', '', 'Friday afternoons']],
    ['Sam Lee', 'sam@example.com', 'mentee', ['High school junior', 'I love coding and want to study computer science.', 'Lincoln High School', '11th grade', 'Technology', 'software,computer science,robotics', 'Land a summer internship and get into a strong CS program.', 'After 4pm']],
    ['Maya Johnson', 'maya@example.com', 'mentee', ['College freshman, pre-med', 'Biology major exploring medicine and research.', 'State University', 'College freshman', 'Healthcare', 'medicine,biology,research', 'Get into medical school and specialize in pediatrics.', 'Evenings']],
  ];
  const ids = {};
  for (const [name, email, role, p] of people) {
    const { lastInsertRowid } = addUser.run(name, email, hash, role);
    ids[email] = Number(lastInsertRowid);
    addProfile.run(ids[email], ...p);
  }

  // A completed session + review so judges immediately see the full flow
  const sam = ids['sam@example.com'], marcus = ids['marcus@example.com'];
  const maya = ids['maya@example.com'], priya = ids['priya@example.com'];
  const reqStmt = db.prepare('INSERT INTO mentorship_requests (mentee_id,mentor_id,message,status) VALUES (?,?,?,?)');
  reqStmt.run(sam, marcus, 'Hi Marcus! I am building my first web app and would love guidance on internships.', 'accepted');
  reqStmt.run(maya, priya, 'Dr. Raman, I would love to learn about your path into pediatrics.', 'pending');

  const s = db.prepare(`INSERT INTO sessions_booked (mentee_id,mentor_id,starts_at,duration,type,topic,status,meeting_url)
    VALUES (?,?,?,?,?,?,?,?)`);
  const past = s.run(sam, marcus, '2026-11-10T16:30', 30, 'video', 'Reviewing my portfolio project', 'completed', 'https://meet.jit.si/MentorshipMatch-demo-1');
  s.run(sam, marcus, '2026-12-02T16:30', 30, 'chat', 'Internship application tips', 'confirmed', '');
  db.prepare('INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating,comment) VALUES (?,?,?,?,?)')
    .run(Number(past.lastInsertRowid), sam, marcus, 5, 'Marcus gave me concrete feedback on my project and a list of internships to apply for. Super helpful!');
}
seed();
applyDemoResumes();

module.exports = db;
