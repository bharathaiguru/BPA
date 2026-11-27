# Changelog

## 3.0.0 — Phase II redesign (implements the team's *Website Redesign Specification*)

### Critical findings (spec §2): status

| ID | Finding | Status | What changed |
|---|---|---|---|
| C01 | `.btn-gold` used but undefined | Fixed | New button system: primary / secondary / tertiary / destructive (`components.css`) |
| C02 | Undefined `--gold` in dashboard | Fixed | All colors come from tokens in `tokens.css`; no stray variables |
| C03 | Industry labels looked like status | Fixed | Separate `.category` (neutral) and `.status-*` (state) styles with icons and text |
| C04 | "Accepting students" shown without checks | Fixed | Accepting = approved + not paused + below capacity; shown only from real data |
| C05 | Booking from a profile lost the mentor | Fixed | "Book a session with …" opens `#/book/:mentorId` with the mentor preselected |
| C06 | Partial translation | Labeled honestly | Home, navigation, footer, Settings, Scribbler translated in 4 languages; Settings states the coverage; translated regions get `lang` attributes; document stays `lang="en"` |
| C07 | Notification switches did nothing | Fixed | Switches removed; Settings explains that only in-app counts exist; sidebar shows real counts |
| C08 | Errors only at top / in toasts | Fixed | Field-level errors linked with `aria-describedby`; server returns the field name; persistent inline alerts |
| C09 | Chat rebuilt every 4 s and jumped | Fixed | Append-only polling (`?after=`), stays in place when reading older messages, "new messages" button, drafts saved, failed messages kept with Retry |
| C10 | Reviews showed student names | Fixed | Public reviews show "Student mentee · grade"; reviews of students are private |
| C11 | Mentors not reviewed | Fixed | Mentor accounts start `pending`; hidden until an admin approves; rejection requires a reason shown to the applicant |
| C12 | Theme contrast failures | Fixed | New palette; `npm run test:contrast` passes all 108 checked pairs across 4 themes |
| C13 | Overlaps only checked identical starts | Fixed | Interval overlap check for mentor **and** student inside an immediate transaction; slots only from availability |
| C14 | Sessions could be completed early | Fixed | Server allows "complete" only after the start time; reviews only for completed sessions |

### Highlights
- **Design system:** tokens (color, type scale, 4px spacing, radius), Fraunces display + Public Sans UI, 4 contrast-checked themes, reusable components, Feather icons replacing emoji.
- **Shell:** public header (Explore mentors · How it works · Our mission · Settings · Log in · Get started); role-specific sidebar with counts; account menu; mobile drawer.
- **Homepage:** 10 sections in spec order; industry grid from live data; featured mentors; mission stats labeled as demo data; trust & safety; FAQ; final call to action.
- **Onboarding:** 3-step student / 4-step mentor flows; guardian acknowledgment for grades 9–12; privacy explained before data is collected.
- **Dashboards:** student "Your mentorship journey" (next appointment, compact metrics, actionable tasks, recommendations with reasons); mentor overview (requests and confirmations first, capacity with pause switch, availability, contribution).
- **Discovery:** filters, sorting, active-filter chips, URL-persisted filters, skeleton loading, cancelled stale searches, empty-state recovery, saved mentors, public explore for visitors.
- **Profiles:** decision-focused mentor profile with sticky connect panel and relationship-based action; structured profile editor; availability editor.
- **Requests:** tabs by state; withdraw pending requests; decisions explain next steps; server blocks re-deciding.
- **Sessions:** Awaiting confirmation / Upcoming / Past; calendar booking with time zones; confirmations for cancel/complete; join window for video.
- **Admin:** moderation center, queue with search/filters, case view with surrounding messages, user inspection, approvals, audit log with who/what/when/why.
- **Scribbler:** honest description, instant answers (no fake typing), page- and role-aware suggestions, history cleared when the account changes, hidden on the chat page so it never covers the composer.
- **Architecture:** server split into `routes/` and `lib/`; front end split into `css/` and `js/views/`; demo and production modes isolated.

### Test results (run on a fresh demo database)
| Suite | Result |
|---|---|
| `npm test` (API: permissions, lifecycle, overlaps, privacy, moderation, DST) | 12 / 12 pass |
| `npm run test:contrast` (4 themes × 27 pairs) | 108 / 108 pass WCAG 2.2 AA |
| `tests/workflows.py` (browser workflows for student, mentor, admin) | 47 / 47 checks pass, 0 console errors |
| axe-core WCAG 2.0/2.1/2.2 A+AA scans (21 pages/states, incl. dark theme + Spanish) | 0 violations |
| Reflow: public pages at 320 px and 390 px; workspace pages at 360 px | No horizontal page scrolling |

### Known limitations (not claimed as done)
- **Usability testing with representative students, mentors, and admins has not been conducted** (spec §29). Automated tests do not replace it.
- **Manual screen-reader testing** (NVDA, VoiceOver) and real mobile-keyboard testing are still needed; automated axe scans cover only part of WCAG.
- **Translations** cover the public home page, navigation, footer, Settings, and Scribbler. Workspace pages are English only.
- **No email or push notifications.** Only in-app attention counts.
- **Rescheduling** is not implemented (cancel and re-book instead). **Goal tracking, résumé review uploads, and industry forums** are not built.
- **Mentor approval is an administrator review, not a background check**, and the UI says so.
- **Hero imagery:** no licensed photograph is included; the team can add one at `public/assets/hero.jpg`.
- **Performance:** no field Core Web Vitals data; the app ships no frameworks, self-hosts only the fonts it uses, and lazy elements are minimal, but this has not been measured at the 75th percentile.
- Chat uses polling every 4 seconds (no WebSockets).

## 2.0.0
Settings panel, Scribbler, mentor résumés, home page redesign.

## 1.0.0
Initial base model: registration, profiles, requests, booking, chat, reviews, admin panel.
