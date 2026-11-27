// lib/matching.js — explainable mentor recommendations.
//
// The score is a RELEVANCE HEURISTIC, not a prediction of mentoring success.
// Weights (from the team's redesign spec, §11.4):
//   Academic interest alignment 35% · Industry alignment 25% · Career goal relevance 25% · Session format 15%
// A factor with no student input (e.g. no interests yet) is left out and the remaining
// weights are re-normalised, and the student is told what to add.
// Eligibility (approved, active, accepting, below capacity) is checked separately — it is
// never a score penalty.

const STOP = new Set(('a an and are as at be but by for from get go i in into is it me my of on or so that the to want ' +
  'with would like love help become career careers job work study studying field get good more about some them they this ' +
  'when where which who will your you strong program programs').split(' '));

// Very small stemmer: strip common endings until stable, so "engineering", "engineers" and
// "engineer" all compare equal. Applied identically to both sides, so it stays deterministic.
const stem = w => { for (let i = 0; i < 3; i++) { const n = w.replace(/(ing|ers|er|s)$/, ''); if (n === w || n.length < 4) break; w = n; } return w; };
const words = text => String(text || '').toLowerCase().replace(/[^a-z0-9+#\s-]/g, ' ').split(/[\s,-]+/)
  .filter(w => w.length > 2 && !STOP.has(w)).map(stem);
const tags = csv => String(csv || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

function overlap(aWords, bWords) {
  const b = new Set(bWords);
  return [...new Set(aWords)].filter(w => b.has(w));
}

/**
 * @param student  profile row of the mentee (interests, industry, career_goals, preferred_format)
 * @param mentor   profile row of the mentor (interests, skills, industry, headline, bio, experience, offers_video, offers_chat)
 * @returns { score: 0–100 (or null when the student has given nothing to match on), reasons: [string], missing: [string] }
 */
function scoreMatch(student, mentor) {
  const factors = [];
  const reasons = [];
  const missing = [];
  const mentorTopicWords = words([mentor.interests, mentor.skills].join(' '));
  const mentorAllWords = words([mentor.interests, mentor.skills, mentor.industry, mentor.headline, mentor.bio, mentor.experience].join(' '));

  // 1. Academic interest alignment (35%)
  const sTags = tags(student.interests);
  if (sTags.length) {
    const shared = sTags.filter(t => overlap(words(t), mentorTopicWords).length > 0);
    const value = Math.min(1, shared.length / Math.min(3, sTags.length));
    factors.push([0.35, value]);
    if (shared.length) reasons.push(`Shares your interest in ${shared.slice(0, 2).join(' and ')}`);
  } else missing.push('academic interests');

  // 2. Industry alignment (25%)
  if (student.industry) {
    const same = student.industry === mentor.industry;
    factors.push([0.25, same ? 1 : 0]);
    if (same) reasons.push(`Works in ${mentor.industry}, your field of interest`);
  } else missing.push('field of interest');

  // 3. Career goal relevance (25%)
  const goalWords = words(student.career_goals);
  if (goalWords.length) {
    const hits = overlap(goalWords, mentorAllWords);
    factors.push([0.25, Math.min(1, hits.length / 3)]);
    if (hits.length) {
      const pretty = hits.includes('internship') ? 'Can offer internship guidance'
        : `Experience related to your goal (${hits.slice(0, 2).join(', ')})`;
      reasons.push(pretty);
    }
  } else missing.push('career goals');

  // 4. Session format preference (15%)
  const pref = student.preferred_format || 'either';
  const fits = pref === 'either' ? (mentor.offers_video || mentor.offers_chat)
    : pref === 'video' ? mentor.offers_video : mentor.offers_chat;
  factors.push([0.15, fits ? 1 : 0]);
  if (fits && pref !== 'either') reasons.push(`Offers ${pref} sessions, your preferred format`);

  // Without any interests, field, or goals there is nothing meaningful to match on.
  if (missing.length === 3) return { score: null, reasons: [], missing };

  const totalWeight = factors.reduce((a, [w]) => a + w, 0);
  const score = totalWeight ? Math.round((factors.reduce((a, [w, v]) => a + w * v, 0) / totalWeight) * 100) : 0;
  return { score, reasons, missing };
}

module.exports = { scoreMatch, words, tags };
