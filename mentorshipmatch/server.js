// server.js — MentorshipMatch: Express app setup. Feature routes live in /routes,
// shared logic in /lib, and the database in db.js.
//
//   npm start                    → competition DEMO (fictional sample data, demo logins shown)
//   npm run start:production     → production mode (no sample data, no demo logins)
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { fail } = require('./lib/helpers');

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
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === '1', maxAge: 1000 * 60 * 60 * 8 },
}));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- API ----------
// heroPhoto: the team can add a licensed photo at public/assets/hero.jpg (see README).
const fs = require('fs');
app.get('/api/config', (req, res) => res.json({ mode: db.MODE, heroPhoto: fs.existsSync(path.join(__dirname, 'public', 'assets', 'hero.jpg')) }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/mentors'));
app.use('/api', require('./routes/profiles'));
app.use('/api', require('./routes/requests'));
app.use('/api', require('./routes/sessions'));
app.use('/api', require('./routes/admin'));

// JSON 404 for unknown API routes; every other path serves the single-page app.
app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); fail(res, 500, 'Something went wrong. Please try again.'); });

if (require.main === module) {
  app.listen(PORT, () => console.log(`MentorshipMatch (${db.MODE} mode) running at http://localhost:${PORT}`));
}
module.exports = app;
