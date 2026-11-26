# MentorshipMatch
**Student-to-Professional Mentorship Platform** · BPA (V04) Web Application Team

MentorshipMatch is a database-driven web application built for a nonprofit that connects high school and college students with professionals in their fields of interest. Students create profiles listing their academic interests and career goals, browse and request mentors, schedule video or chat sessions, and leave reviews after meetings. Administrators manage users and moderate flagged activity.

---

## Quick start

Requires **Node.js 22 or newer** (uses the built-in `node:sqlite` database driver, so there's nothing extra to install).

```bash
npm install
npm start
```
Open **http://localhost:3000**. The database (`mentorshipmatch.db`) is created and seeded with demo data on first run. To reset it, delete the file and restart.

### Demo accounts (password for all: `Password123!`)
| Role | Email |
|---|---|
| Student (mentee) | `sam@example.com` |
| Student (mentee) | `maya@example.com` |
| Mentor | `marcus@example.com` |
| Mentor | `priya@example.com` |
| Admin | `admin@mentorshipmatch.org` |

---

## Required features → where to find them

| Requirement (from the prompt) | Implementation |
|---|---|
| **User registration and login** | `POST /api/auth/register`, `/login`, `/logout`. Passwords hashed with bcrypt (cost 12), server-side validation, session cookies (`httpOnly`, `sameSite`), and login rate limiting. Role chosen at sign-up (Student / Professional). |
| **Mentor/mentee profile management** | *My Profile* page. Students: school, grade level, academic interests, career goals. Mentors: job title, employer, industry, topics, availability. Public profile preview. |
| **Browse and request mentors** | *Find Mentors*: live search (name, title, interest, employer) plus industry filter. Mentor profile shows bio, interests, average rating, reviews, and a **Request mentorship** button with an intro message. Mentors accept or decline under *Requests*. |
| **Schedule video or chat sessions** | *Sessions*: students book with accepted mentors (date/time, 30/45/60 min, video or chat, topic). Server blocks past dates and double-booking. When a mentor confirms, a private **Jitsi video link** is generated, or for chat sessions an **in-app chat room** opens. |
| **Leave reviews after meetings** | After a session is marked complete, both participants can leave a 1–5 star rating and comment (one review per person per session). Ratings are averaged on mentor cards and profiles. |
| **Admin panel: manage users and flag inappropriate activity** | Any user can ⚑ **Report** a profile, review, or chat message. The *Admin* panel shows platform stats, a **flag queue** (remove content, suspend user, resolve, dismiss), **user management** (suspend, reactivate, delete), and an **audit log** of every admin action. |

## Architecture

```
mentorshipmatch/
├── server.js          Express server: REST API, auth, role-based access control
├── db.js              SQLite schema (8 tables) + demo seed data
├── public/
│   ├── index.html     App shell (semantic landmarks, skip link, dialog)
│   ├── styles.css     Design system: tokens, components, responsive breakpoints
│   ├── app.js         Single-page front end (hash router, views, API client)
│   └── fonts/         Self-hosted fonts (works offline at competition)
└── package.json
```

**Stack:** Node.js · Express 5 · SQLite (`node:sqlite`) · vanilla HTML/CSS/JavaScript (no front-end framework, so every line is explainable to judges).

### Database schema (relational, with foreign keys and CHECK constraints)
`users` · `profiles` (1:1 with users) · `mentorship_requests` · `sessions_booked` · `messages` · `reviews` · `flags` · `audit_log`

### Security
- bcrypt password hashing; passwords are never stored or returned
- Parameterized SQL everywhere (prevents SQL injection)
- All rendered output is HTML-escaped by the `html` template tag (prevents XSS)
- Helmet security headers and a Content Security Policy (no inline scripts)
- Role checks enforced **on the server**, not just hidden in the UI
- Rate-limited login and registration; session ID regenerated on login
- **Student privacy:** a student profile is visible only to mentors they've contacted (many users are minors)
- Suspended users are blocked from every API call immediately

### Accessibility (WCAG 2.1 AA)
Skip link · semantic landmarks · every input has a label · `aria-live` regions for toasts, search results, and chat · keyboard-operable dialogs (native `<dialog>`) · visible focus outlines · screen-reader text for star ratings · color contrast checked · respects `prefers-reduced-motion` · responsive down to 320px.

## Credits & sources
- Fonts: **Public Sans**, **Atkinson Hyperlegible** (Braille Institute), and **OpenDyslexic** via Fontsource, SIL Open Font License 1.1
- Scribbler robot illustration and icons: original artwork made for this project
- Video meetings: **Jitsi Meet** (meet.jit.si), free and open source
- npm packages (MIT license): express, express-session, helmet, express-rate-limit, bcryptjs
- All people, organizations, and reviews in the demo data are fictional. No copyrighted images are used; icons are original SVG or Unicode.

## Team roles
| Member | Role | Contributions |
|---|---|---|
| _Name_ | Project lead / back end | |
| _Name_ | Front-end / UI design | |
| _Name_ | Database / QA testing | |
