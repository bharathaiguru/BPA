# MentorshipMatch

**Student-to-Professional Mentorship Platform** · BPA (V04) Web Application Team
Team: **Bharath, Sahass, Shivesh, and Saksham**

MentorshipMatch is a database-driven web application for a nonprofit that connects high school and college students with volunteer professionals. Students build a profile around their interests and goals, discover mentors (with explainable recommendations), send a request, book a session from the mentor's real availability, meet by video or chat, and leave a review. Administrators approve mentors, moderate reports with full context, and every serious action is recorded in an audit log.

---

## Quick start

Requires **Node.js 22.5 or newer** (it uses the built-in `node:sqlite` database).

```bash
npm install
npm start                 # competition demo (fictional sample data)
```
Open **http://localhost:3000**.

| Demo account (password `Password123!`) | Role |
|---|---|
| `sam@example.com` | Student (has a mentor, an upcoming chat session, and a past session) |
| `maya@example.com` | Student (has a pending request) |
| `marcus@example.com` | Mentor |
| `daniel@example.com` | Mentor whose application is **awaiting approval** |
| `admin@mentorshipmatch.org` | Administrator |

**Reset the demo:** stop the server, delete `mentorshipmatch.db`, and run `npm start` again.
Demo dates are generated relative to today, so there is always one past and one upcoming session.

### Demo vs. production
| | `npm start` (demo) | `npm run start:production` |
|---|---|---|
| Database file | `mentorshipmatch.db` | `mentorshipmatch-production.db` |
| Sample people | Fictional, clearly labeled with a banner | None |
| Demo log-in buttons | Shown on the log-in page | Never shown |
| First admin | Seeded | Created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) environment variables |

Windows PowerShell: use `npm.cmd install` / `npm.cmd start` if scripts are blocked.

### Tests
```bash
npm test                  # 12 API tests: permissions, booking overlaps, lifecycle, privacy, moderation
npm run test:contrast     # WCAG 2.2 AA contrast for every theme (reads public/css/tokens.css)
# Browser workflows (optional): start the server on a fresh database, then
npm i --no-save axe-core && pip install playwright && python -m playwright install chromium
python3 tests/workflows.py   # 47 checks for all three roles + axe-core accessibility scans
```

---

## Required BPA features → where they are

| Requirement | Implementation |
|---|---|
| Registration & login | Guided onboarding: students 3 steps (Account → Interests → Goals), mentors 4 steps (Account → Background → Preferences → Approval). Field-level errors, show-password, input kept across steps. bcrypt hashing, rate limiting, session cookies. |
| Mentor/mentee profiles | **My profile** with sections, tag inputs, repeatable résumé rows, accurate completion %, visibility explanation, password change. |
| Browse & request mentors | **Find mentors**: search, industry / session type / availability filters, sorting, removable filter chips kept in the URL, saved mentors, explainable recommendations. Mentor profiles show state-based actions (Request, Awaiting response, Book, Declined → alternatives, Not accepting). |
| Session booking (video/chat) | Calendar booking from the mentor's weekly availability, shown in the student's time zone; durations and formats the mentor offers; summary before submitting. The server stores UTC timestamps and rejects overlaps for **both** people. |
| Reviews | Only after a completed session, one per person, no default rating, labeled 1–5 scale. Student reviewer names are never shown publicly. |
| Admin panel | Overview, **moderation queue with case view and context**, user search/filters/inspect, **mentor approvals**, audit log with reasons. Suspensions, removals, rejections, and deletions require a reason; deletion requires typing the account name. |

## Optional enhancements built
- **Personalized, explainable recommendations** (`lib/matching.js`): interests 35%, industry 25%, career goals 25%, session format 15%. It's a relevance heuristic with reasons shown, not a prediction.
- **Structured scheduling & availability** with time zones and overlap prevention (`lib/time.js`).
- **Mentor approval workflow**: new mentors are hidden until an admin approves them.
- **Saved mentors.**
- **Mentor capacity & pause**: a mentor can cap active mentees and pause new requests.
- **Accessibility settings & 4 themes**, partial translations (see CHANGELOG), and **Scribbler**, a rule-based help guide.

---

## Architecture

```
server.js              Express setup, security headers, route mounting
db.js                  Schema, safe migrations, demo seed / production admin
lib/time.js            Time-zone conversion and slot generation (DST-safe)
lib/matching.js        Explainable recommendation score
lib/helpers.js         Validation, auth guards, mentor data shaping
routes/auth.js         Register (onboarding), login, logout, password
routes/mentors.js      Directory, recommendations, saved mentors, slots, public pages
routes/profiles.js     Own profile, availability, viewing profiles (privacy rules)
routes/requests.js     Request lifecycle, connections, attention counts
routes/sessions.js     Booking, session lifecycle, chat, reviews
routes/admin.js        Reporting + admin (moderation, users, approvals, audit)
public/css/            tokens · base · components · layouts · pages
public/js/             core · components · i18n · shell · settings · scribbler · app
public/js/views/       public · auth · dashboard · mentors · requests · sessions · profile · admin
tests/                 api.test.js · contrast.js · workflows.py
```

**Database tables:** users, profiles, mentorship_requests, sessions_booked, messages, reviews, flags, audit_log, availability, saved_mentors. Older databases are migrated automatically on start.

### Security & privacy
- bcrypt password hashing; Helmet headers and a strict Content Security Policy (no inline scripts)
- Parameterized SQL everywhere; every value rendered in the browser is HTML-escaped
- All role and ownership checks happen **on the server** (hiding navigation is only a convenience)
- Student profiles are private: visible only to mentors the student contacted, and to admins
- Public reviews show "Student mentee · grade", never a name; emails are never shown to other members
- Video links are revealed only during the join window (15 minutes before to 15 minutes after)
- Reports are validated: the target must exist and be visible to the reporter; duplicates are rejected

### Accessibility (target: WCAG 2.2 AA)
Skip link that moves focus without breaking the hash router · focus moves to each new page's heading · labels and error messages linked to every field · native `<dialog>` with focus restored on close · status shown with text + icon, never color alone · 44px touch targets · reflow to 320px · respects the OS reduced-motion setting · theme contrast verified automatically.

### Adding a hero photo
The home page shows an illustration built from real UI components. To use a photo instead, add a **licensed** image at `public/assets/hero.jpg` (a photo of your own team role-playing a mentoring session works well) and restart. Don't use photos of people without permission, and don't present stock models as real participants.

## Credits & licenses
- Fonts: Public Sans (USWDS), Fraunces, Atkinson Hyperlegible (Braille Institute), OpenDyslexic, via Fontsource, SIL Open Font License 1.1
- Icons: Feather Icons (MIT). Logo and Scribbler mascot: original artwork for this project.
- Video: Jitsi Meet (meet.jit.si)
- npm packages (MIT): express, express-session, helmet, express-rate-limit, bcryptjs
- All demo people, organizations, reviews, and activity are fictional.

## Team contributions
| Member | Primary ownership (spec §27) | Contributions |
|---|---|---|
| Bharath | | |
| Sahass | | |
| Shivesh | | |
| Saksham | | |

See **CHANGELOG.md** for what changed in version 3, test results, and known limitations.
