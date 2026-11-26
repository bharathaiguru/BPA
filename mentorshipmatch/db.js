// db.js — database schema, safe migrations, and demo seed data.
// SQLite via Node's built-in node:sqlite (Node 22.5+).
//
// Two isolated modes:
//   demo (default, `npm start`)          → mentorshipmatch.db, seeded with FICTIONAL sample people
//   production (`npm run start:production`) → mentorshipmatch-production.db, no sample data, no demo logins
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const { zonedToUtc, partsInZone, DAY_MS } = require('./lib/time');

const MODE = process.argv.includes('--production') || process.env.MM_MODE === 'production' ? 'production' : 'demo';
const FILE = process.env.DB_FILE || path.join(__dirname, MODE === 'production' ? 'mentorshipmatch-production.db' : 'mentorshipmatch.db');
const db = new DatabaseSync(FILE);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mentee','mentor','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT DEFAULT '', bio TEXT DEFAULT '', organization TEXT DEFAULT '', grade_level TEXT DEFAULT '',
  industry TEXT DEFAULT '', interests TEXT DEFAULT '', career_goals TEXT DEFAULT '', availability TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS mentorship_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (mentee_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS sessions_booked (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 30,
  type TEXT NOT NULL CHECK (type IN ('video','chat')),
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled')),
  meeting_url TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions_booked(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions_booked(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (session_id, reviewer_id)
);
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user','review','message')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- v3: weekly availability windows in the mentor's own time zone
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Sunday
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (end_min > start_min)
);
-- v3: students can save mentors to compare later
CREATE TABLE IF NOT EXISTS saved_mentors (
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (mentee_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_mentor ON sessions_booked(mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_mentee ON sessions_booked(mentee_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
`);

// ---------- Migrations (safe to run repeatedly on older databases) ----------
function addColumns(table, cols) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const [name, def] of cols) if (!have.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}
addColumns('users', [
  ['approval_status', "TEXT NOT NULL DEFAULT 'approved'"], // mentors: pending | approved | rejected
  ['approval_note', "TEXT DEFAULT ''"],
]);
addColumns('profiles', [
  ['education', "TEXT DEFAULT ''"], ['experience', "TEXT DEFAULT ''"], ['skills', "TEXT DEFAULT ''"],
  ['achievements', "TEXT DEFAULT ''"], ['years_experience', 'INTEGER DEFAULT 0'],
  ['timezone', "TEXT DEFAULT 'America/Chicago'"],
  ['capacity', 'INTEGER DEFAULT 3'],          // mentor: max active mentees
  ['accepting', 'INTEGER DEFAULT 1'],         // mentor: accepting new requests (pause switch)
  ['offers_video', 'INTEGER DEFAULT 1'], ['offers_chat', 'INTEGER DEFAULT 1'],
  ['durations', "TEXT DEFAULT '30,45,60'"],
  ['mentoring_style', "TEXT DEFAULT ''"],
  ['preferred_format', "TEXT DEFAULT 'either'"], // student: video | chat | either
  ['guardian_ack_at', 'TEXT'],                     // student in grades 9–12: guardian acknowledgment time
]);
addColumns('sessions_booked', [['ends_at', "TEXT DEFAULT ''"], ['cancelled_by', 'INTEGER'], ['cancel_reason', "TEXT DEFAULT ''"]]);
addColumns('mentorship_requests', [['responded_at', 'TEXT']]);
addColumns('flags', [['resolution_note', "TEXT DEFAULT ''"], ['resolved_by', 'INTEGER'], ['resolved_at', 'TEXT']]);
addColumns('audit_log', [['reason', "TEXT DEFAULT ''"], ['target', "TEXT DEFAULT ''"]]);

// v3 migration: older versions stored local wall-clock strings like "2026-12-02T16:30".
// Convert any zone-less start time to an unambiguous UTC timestamp (assumed America/Chicago,
// the demo's home zone) and fill in ends_at.
for (const s of db.prepare("SELECT id, starts_at, duration FROM sessions_booked WHERE starts_at NOT LIKE '%Z'").all()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s.starts_at);
  if (!m) continue;
  const ms = zonedToUtc(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5], 'America/Chicago');
  db.prepare('UPDATE sessions_booked SET starts_at=?, ends_at=? WHERE id=?')
    .run(new Date(ms).toISOString(), new Date(ms + s.duration * 60000).toISOString(), s.id);
}
db.exec("UPDATE sessions_booked SET ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', starts_at, '+' || duration || ' minutes') WHERE ends_at IS NULL OR ends_at = ''");

// ---------- Demo data (fictional people; demo mode only) ----------
const DEMO_MENTORS = [
  { email: 'priya@example.com', name: 'Dr. Priya Raman', headline: 'Pediatric Physician', org: "Children's Health Partners", industry: 'Healthcare',
    bio: 'I help students explore pre-med paths, MCAT planning, and what life in medicine actually looks like.',
    interests: 'medicine,biology,pre-med,research', years: 12, style: 'Relaxed and question-driven. Bring your questions and we will map out next steps together.',
    experience: "Pediatric Physician | Children's Health Partners | 2017–present\nChief Resident, Pediatrics | University Medical Center | 2016–2017\nPediatrics Resident | University Medical Center | 2013–2016",
    education: 'M.D. — University of Texas Southwestern Medical School\nB.S. Biology — Rice University',
    skills: 'pediatrics,patient care,clinical research,MCAT prep,public speaking',
    achievements: 'Board Certified, American Board of Pediatrics\nPublished 6 peer-reviewed articles on childhood asthma\nVolunteer physician, Dallas free clinic (8 years)',
    windows: [[1, '18:00', '20:00'], [3, '18:00', '20:00']], video: 1, chat: 1 },
  { email: 'marcus@example.com', name: 'Marcus Bell', headline: 'Senior Software Engineer', org: 'Northwind Tech', industry: 'Technology',
    bio: 'Ten years building web apps. Happy to review projects, talk internships, and demystify CS degrees vs. bootcamps.',
    interests: 'software,web development,computer science,internships', years: 10, style: 'Hands-on. I like to look at real projects and give specific, practical feedback.',
    experience: 'Senior Software Engineer | Northwind Tech | 2020–present\nSoftware Engineer | Brightline Payments | 2016–2020\nSoftware Engineering Intern | Brightline Payments | Summer 2015',
    education: 'B.S. Computer Science — University of Texas at Dallas',
    skills: 'JavaScript,Node.js,React,SQL,system design,code review',
    achievements: 'Led rebuild of a checkout system used by 2M+ customers\nMentor, Girls Who Code Dallas chapter\nSpeaker, DFW JavaScript Meetup',
    windows: [[2, '15:00', '18:00'], [4, '15:00', '18:00']], video: 1, chat: 1 },
  { email: 'elena@example.com', name: 'Elena Ortiz', headline: 'Marketing Director', org: 'Bright Lane Agency', industry: 'Business & Marketing',
    bio: 'Brand strategy, social media careers, and building a portfolio before college.',
    interests: 'marketing,business,social media,entrepreneurship', years: 9, style: 'Encouraging and creative. We will brainstorm and build something you can show.',
    experience: 'Marketing Director | Bright Lane Agency | 2021–present\nSocial Media Manager | Lone Star Coffee Co. | 2018–2021\nMarketing Coordinator | Frisco RoughRiders | 2016–2018',
    education: 'B.B.A. Marketing — Texas A&M University',
    skills: 'brand strategy,social media,content creation,analytics,Adobe Creative Suite',
    achievements: "Grew a client's Instagram audience from 4K to 120K\nAmerican Marketing Association member\nGuest lecturer, high school DECA chapters",
    windows: [[6, '10:00', '13:00']], video: 1, chat: 1 },
  { email: 'james@example.com', name: 'James Whitfield', headline: 'Civil Engineer, P.E.', org: 'Midwest Infrastructure Group', industry: 'Engineering',
    bio: 'Infrastructure, bridges, and getting into engineering programs. First-generation college graduate.',
    interests: 'engineering,math,physics,first-gen', years: 14, style: 'Structured. I share a plan before each session and follow up with resources.',
    experience: 'Senior Civil Engineer | Midwest Infrastructure Group | 2015–present\nProject Engineer | Texas Department of Transportation | 2011–2015',
    education: 'M.S. Civil Engineering — Texas Tech University\nB.S. Civil Engineering — Texas Tech University (first-generation graduate)',
    skills: 'structural design,AutoCAD,project management,surveying,bridge inspection',
    achievements: 'Licensed Professional Engineer (P.E.), Texas\nLead engineer on a 1.2-mile highway bridge replacement\nASCE Young Engineer of the Year (2016)',
    windows: [[1, '18:30', '20:30'], [3, '18:30', '20:30']], video: 1, chat: 0 },
  { email: 'aisha@example.com', name: 'Aisha Khan', headline: 'Corporate Attorney', org: 'Khan & Lowe LLP', industry: 'Law & Government',
    bio: 'Law school admissions, the debate-to-law pipeline, and careers in public policy.',
    interests: 'law,policy,debate,writing', years: 11, style: 'Direct and honest. Expect practice questions and real talk about law school.',
    experience: 'Partner, Corporate Law | Khan & Lowe LLP | 2020–present\nAssociate Attorney | Harmon Reed LLP | 2014–2020\nLaw Clerk | U.S. District Court, N.D. Texas | 2013–2014',
    education: 'J.D. — SMU Dedman School of Law\nB.A. Political Science — University of North Texas',
    skills: 'contract law,negotiation,legal writing,public policy,debate',
    achievements: 'Texas Super Lawyers "Rising Star" (2019–2022)\nState debate finalist in high school\nPro bono counsel for two youth nonprofits',
    windows: [[5, '13:00', '16:00']], video: 1, chat: 1 },
  { email: 'lena@example.com', name: 'Dr. Lena Park', headline: 'Environmental Scientist', org: 'North Texas Water Institute', industry: 'Science & Research',
    bio: 'Field research, lab work, and how to get involved in science as a high school student.',
    interests: 'biology,chemistry,environmental science,research', years: 8, style: 'Curious and patient. I love helping students design their first research project.',
    experience: 'Senior Scientist | North Texas Water Institute | 2021–present\nPostdoctoral Researcher | University of North Texas | 2018–2021',
    education: 'Ph.D. Environmental Science — University of North Texas\nB.S. Chemistry — Baylor University',
    skills: 'water quality testing,data analysis,field research,scientific writing',
    achievements: 'Lead author on a regional drinking-water study\nJudge, Dallas Regional Science & Engineering Fair',
    windows: [[2, '17:00', '19:00'], [6, '09:00', '11:00']], video: 1, chat: 1 },
];

function setAvailability(mentorId, windows) {
  db.prepare('DELETE FROM availability WHERE mentor_id=?').run(mentorId);
  const ins = db.prepare('INSERT INTO availability (mentor_id, weekday, start_min, end_min) VALUES (?,?,?,?)');
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  for (const [wd, s, e] of windows) ins.run(mentorId, wd, mins(s), mins(e));
}

// Upgrade older demo databases: fill résumé/availability fields that are still empty.
function upgradeDemoMentors() {
  const isDemoDb = db.prepare("SELECT 1 FROM users WHERE email='admin@mentorshipmatch.org'").get();
  for (const m of DEMO_MENTORS) {
    let u = db.prepare('SELECT id FROM users WHERE email=?').get(m.email);
    if (!u && isDemoDb) { // mentor added in a later version of the demo data
      const uid = Number(db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'mentor')")
        .run(m.name, m.email, bcrypt.hashSync('Password123!', 10)).lastInsertRowid);
      db.prepare(`INSERT INTO profiles (user_id, headline, bio, organization, industry, interests) VALUES (?,?,?,?,?,?)`)
        .run(uid, m.headline, m.bio, m.org, m.industry, m.interests);
      u = { id: uid };
    }
    if (!u) continue;
    db.prepare(`UPDATE profiles SET
      experience = CASE WHEN experience IS NULL OR experience='' THEN ? ELSE experience END,
      education = CASE WHEN education IS NULL OR education='' THEN ? ELSE education END,
      skills = CASE WHEN skills IS NULL OR skills='' THEN ? ELSE skills END,
      achievements = CASE WHEN achievements IS NULL OR achievements='' THEN ? ELSE achievements END,
      years_experience = CASE WHEN years_experience IS NULL OR years_experience=0 THEN ? ELSE years_experience END,
      mentoring_style = CASE WHEN mentoring_style IS NULL OR mentoring_style='' THEN ? ELSE mentoring_style END,
      offers_chat = ? WHERE user_id = ?`)
      .run(m.experience, m.education, m.skills, m.achievements, m.years, m.style, m.chat, u.id);
    const has = db.prepare('SELECT COUNT(*) n FROM availability WHERE mentor_id=?').get(u.id).n;
    if (!has) setAvailability(u.id, m.windows);
  }
}

// Find the next start time (UTC ms) that falls inside a mentor's weekly window, N days from now.
function nextWindowStart(windows, tz, fromMs, minDaysAhead) {
  const p = partsInZone(fromMs, tz);
  for (let i = minDaysAhead; i < minDaysAhead + 14; i++) {
    const noon = zonedToUtc(p.y, p.m, p.d, 720, tz) + i * DAY_MS;
    const dp = partsInZone(noon, tz);
    const w = windows.find(x => x[0] === dp.weekday);
    if (w) return zonedToUtc(dp.y, dp.m, dp.d, +w[1].slice(0, 2) * 60 + +w[1].slice(3), tz);
  }
  return fromMs + minDaysAhead * DAY_MS;
}

function seedDemo() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const hash = bcrypt.hashSync('Password123!', 10);
  const addUser = db.prepare('INSERT INTO users (name,email,password_hash,role,approval_status) VALUES (?,?,?,?,?)');
  const id = {};
  id.admin = Number(addUser.run('Admin Team', 'admin@mentorshipmatch.org', hash, 'admin', 'approved').lastInsertRowid);
  db.prepare("INSERT INTO profiles (user_id, headline, organization) VALUES (?, 'Platform Administrator', 'MentorshipMatch')").run(id.admin);

  const addMentorProfile = db.prepare(`INSERT INTO profiles (user_id, headline, bio, organization, industry, interests, experience, education,
    skills, achievements, years_experience, mentoring_style, offers_video, offers_chat, timezone, capacity, accepting)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'America/Chicago',3,1)`);
  for (const m of DEMO_MENTORS) {
    const uid = Number(addUser.run(m.name, m.email, hash, 'mentor', 'approved').lastInsertRowid);
    id[m.email] = uid;
    addMentorProfile.run(uid, m.headline, m.bio, m.org, m.industry, m.interests, m.experience, m.education, m.skills, m.achievements, m.years, m.style, m.video, m.chat);
    setAvailability(uid, m.windows);
  }
  // A mentor who signed up but is still waiting for admin approval (shows the approval workflow)
  const pend = Number(addUser.run('Daniel Kim', 'daniel@example.com', hash, 'mentor', 'pending').lastInsertRowid);
  addMentorProfile.run(pend, 'Financial Analyst', 'I work in corporate finance and want to help students curious about accounting and investing.',
    'Lakeside Capital', 'Finance', 'finance,accounting,investing', 'Financial Analyst | Lakeside Capital | 2022–present', 'B.S. Finance — University of Houston',
    'Excel,financial modeling', '', 3, '', 1, 1);
  setAvailability(pend, [[4, '18:00', '20:00']]);

  const addMentee = (name, email, p) => {
    const uid = Number(addUser.run(name, email, hash, 'mentee', 'approved').lastInsertRowid);
    db.prepare(`INSERT INTO profiles (user_id, headline, bio, organization, grade_level, industry, interests, career_goals, preferred_format)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(uid, ...p);
    return uid;
  };
  const sam = addMentee('Sam Lee', 'sam@example.com', ['High school junior', 'I love coding and want to study computer science.', 'Lincoln High School',
    '11th grade', 'Technology', 'software,computer science,robotics', 'Land a summer software internship and get into a strong computer science program.', 'either']);
  const maya = addMentee('Maya Johnson', 'maya@example.com', ['College freshman, pre-med', 'Biology major exploring medicine and research.', 'State University',
    'College freshman', 'Healthcare', 'medicine,biology,research', 'Get into medical school and specialize in pediatrics.', 'video']);

  const marcus = id['marcus@example.com'], priya = id['priya@example.com'];
  const req = db.prepare("INSERT INTO mentorship_requests (mentee_id,mentor_id,message,status,responded_at) VALUES (?,?,?,?,?)");
  req.run(sam, marcus, 'Hi Marcus! I am building my first web app and would love guidance on internships.', 'accepted', new Date().toISOString());
  req.run(maya, priya, 'Dr. Raman, I would love to learn about your path into pediatrics.', 'pending', null);

  // Sessions relative to "now" so the demo always has one past and one upcoming meeting.
  const mw = DEMO_MENTORS[1].windows, now = Date.now();
  const pastStart = nextWindowStart(mw, 'America/Chicago', now - 12 * DAY_MS, 0);
  const nextStart = nextWindowStart(mw, 'America/Chicago', now, 2);
  const s = db.prepare(`INSERT INTO sessions_booked (mentee_id,mentor_id,starts_at,ends_at,duration,type,topic,status,meeting_url) VALUES (?,?,?,?,?,?,?,?,?)`);
  const iso = ms => new Date(ms).toISOString();
  const past = s.run(sam, marcus, iso(pastStart), iso(pastStart + 30 * 60000), 30, 'video', 'Reviewing my portfolio project', 'completed', 'https://meet.jit.si/MentorshipMatch-demo-1');
  s.run(sam, marcus, iso(nextStart), iso(nextStart + 30 * 60000), 30, 'chat', 'Internship application tips', 'confirmed', '');
  db.prepare('INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating,comment) VALUES (?,?,?,?,?)')
    .run(Number(past.lastInsertRowid), sam, marcus, 5, 'Marcus gave me concrete feedback on my project and a list of internships to apply for. Super helpful!');
}

// Production: create the first administrator from environment variables (no sample data).
function ensureProductionAdmin() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role='admin'").get();
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (hasAdmin) return;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    console.warn('No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) and restart to create one.');
    return;
  }
  const r = db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES ('Administrator',?,?,'admin')")
    .run(ADMIN_EMAIL.toLowerCase(), bcrypt.hashSync(ADMIN_PASSWORD, 12));
  db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(Number(r.lastInsertRowid));
  console.log(`Created administrator ${ADMIN_EMAIL}.`);
}

if (MODE === 'demo') { seedDemo(); upgradeDemoMentors(); } else ensureProductionAdmin();

module.exports = db;
module.exports.MODE = MODE;
module.exports.setAvailability = setAvailability;
