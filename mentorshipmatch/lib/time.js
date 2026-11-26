// lib/time.js — time-zone-aware scheduling helpers.
// All session times are STORED as UTC ISO-8601 strings (e.g. 2026-12-02T22:30:00.000Z).
// Mentor availability is defined as weekly windows in the MENTOR'S time zone and is
// converted to real UTC instants here, so daylight-saving changes are handled.

const DAY_MS = 24 * 60 * 60 * 1000;

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Wall-clock parts of an instant as seen in a time zone.
function partsInZone(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, weekday };
}

// Offset (ms) of the zone from UTC at a given instant.
function offsetMs(ms, tz) {
  const p = partsInZone(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}

// Convert a wall-clock time (date + minutes after midnight) in `tz` to a UTC instant (ms).
function zonedToUtc(y, m, d, minutes, tz) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let result = guess - offsetMs(guess, tz);
  const check = guess - offsetMs(result, tz); // second pass handles DST boundaries
  if (check !== result) result = check;
  return result;
}

const toMinutes = hhmm => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMinutes = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/**
 * Generate bookable slot start times (UTC ms) for a mentor.
 * @param windows  [{weekday, start_min, end_min}] in the mentor's zone
 * @param tz       mentor's IANA time zone
 * @param duration minutes
 * @param busy     [[startMs, endMs], ...] existing requested/confirmed sessions (mentor + student)
 * @param opts     { fromMs, days, leadMinutes, stepMinutes }
 */
function generateSlots(windows, tz, duration, busy, opts = {}) {
  const now = opts.fromMs ?? Date.now();
  const days = opts.days ?? 28;
  const earliest = now + (opts.leadMinutes ?? 120) * 60000;
  const step = opts.stepMinutes ?? 30;
  const out = [];
  const startParts = partsInZone(now, tz);
  for (let i = 0; i <= days; i++) {
    // Walk calendar days in the mentor's zone (noon avoids DST edge cases).
    const noon = zonedToUtc(startParts.y, startParts.m, startParts.d, 12 * 60, tz) + i * DAY_MS;
    const dp = partsInZone(noon, tz);
    for (const w of windows.filter(x => x.weekday === dp.weekday)) {
      for (let t = w.start_min; t + duration <= w.end_min; t += step) {
        const s = zonedToUtc(dp.y, dp.m, dp.d, t, tz);
        const e = s + duration * 60000;
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => overlaps(s, e, bs, be))) continue;
        out.push(s);
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

module.exports = { isValidTimeZone, partsInZone, zonedToUtc, toMinutes, fromMinutes, overlaps, generateSlots, DAY_MS };
