/* views/auth.js — log in and guided onboarding (spec §8).
   Students: 1 Account → 2 Interests → 3 Goals.  Mentors: 1 Account → 2 Background → 3 Preferences → 4 Approval.
   One form, shown a step at a time, so nothing typed is lost when going back or after an error. */
'use strict';

const authBrand = () => html`<div class="auth-brand"><h2>Big ambitions deserve meaningful guidance.</h2>
  <p>Join a community built around learning, professional growth, and opportunity.</p>
  <ul><li>${icon('check-circle')}Free for students; mentors volunteer their time</li><li>${icon('lock')}Student profiles are private by default</li><li>${icon('shield')}Every mentor is reviewed by an administrator</li></ul></div>`;

const passwordField = (name, label, autocomplete, hint = '') => {
  const id = `pw-${name}`;
  return html`<div class="field" data-field="${name}"><label for="${id}">${label}</label>
    <div class="input-affix"><input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required aria-describedby="${id}-err ${hint ? id + '-hint' : ''}">
      <button type="button" class="icon-btn" data-toggle-pw="${id}" aria-pressed="false" aria-label="Show password">${icon('eye')}</button></div>
    ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}<p class="field-error" id="${id}-err" aria-live="polite"></p></div>`;
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-toggle-pw]'); if (!b) return;
  const input = document.getElementById(b.dataset.togglePw), show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  b.innerHTML = icon(show ? 'eye-off' : 'eye').s;
});

function afterLogin(user) {
  MM.state.user = user;
  const next = MM.query().get('next');
  MM.go(next && next.startsWith('/') ? '#' + next : user.role === 'admin' ? '#/admin' : '#/dashboard');
}

// ---------- Log in ----------
MM.route('/login', () => {
  if (MM.state.user) return MM.go('#/dashboard');
  const demo = MM.state.config.mode === 'demo';
  $('#main').innerHTML = html`<div class="auth-split">${authBrand()}
    <div class="auth-form-wrap"><div class="auth-form">
      <h1>Log in</h1><p class="t-muted">Welcome back. Don’t have an account? <a href="#/register">Create one</a>.</p>
      <form class="form" id="loginForm" novalidate>
        <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
        ${field({ name: 'email', label: 'Email address', type: 'email', required: true, attrs: 'autocomplete="email"' })}
        ${passwordField('password', 'Password', 'current-password')}
        <button class="btn btn-primary btn-block btn-lg" type="submit">Log in</button>
      </form>
      ${demo ? html`<div class="demo-box" role="note"><strong>Competition demo accounts</strong> (fictional; password <code>Password123!</code>). This box only appears in the demo build.
        <div class="row" style="margin-top:8px">${[['Student', 'sam@example.com'], ['Mentor', 'marcus@example.com'], ['Admin', 'admin@mentorshipmatch.org'], ['Pending mentor', 'daniel@example.com']]
          .map(([r, e]) => html`<button type="button" class="btn btn-secondary btn-sm" data-demo="${e}">Use ${r}</button>`)}</div></div>` : ''}
    </div></div></div>`;
  const form = $('#loginForm');
  $('#main').addEventListener('click', e => { const b = e.target.closest('[data-demo]'); if (b) { form.email.value = b.dataset.demo; form.password.value = 'Password123!'; form.querySelector('[type=submit]').focus(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(form);
    const v = Object.fromEntries(new FormData(form));
    try { afterLogin(await withBusy(form.querySelector('[type=submit]'), () => api('/auth/login', { method: 'POST', body: v }))); }
    catch (err) { showFormError(form, err); }
  });
}, { title: 'Log in', layout: 'public' });

// ---------- Register ----------
const GRADES = ['9th grade', '10th grade', '11th grade', '12th grade', 'College freshman', 'College sophomore', 'College junior', 'College senior'];
const INTEREST_SUGGESTIONS = ['computer science', 'medicine', 'engineering', 'business', 'law', 'biology', 'design', 'research', 'internships', 'college applications'];
const STEPS = {
  mentee: [['Account', ['name', 'email', 'password']], ['Interests', ['grade_level', 'organization', 'industry', 'interests']], ['Goals', ['career_goals', 'preferred_format', 'guardianAck', 'agree']]],
  mentor: [['Account', ['name', 'email', 'password']], ['Background', ['headline', 'organization', 'industry', 'years_experience', 'experience']], ['Preferences', ['interests', 'bio', 'offers', 'capacity', 'timezone']], ['Approval', ['agree']]],
};
const pwRules = pw => [[pw.length >= 8, 'At least 8 characters'], [/[A-Za-z]/.test(pw), 'A letter'], [/\d/.test(pw), 'A number']];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

MM.route('/register', () => {
  if (MM.state.user) return MM.go('#/dashboard');
  let role = MM.query().get('role') === 'mentor' ? 'mentor' : 'mentee';
  let step = 0;
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOptions = [...new Set([myTz, ...TIMEZONES])].map(z => [z, z.replace(/_/g, ' ')]);

  $('#main').innerHTML = html`<div class="auth-split">${authBrand()}
    <div class="auth-form-wrap"><div class="auth-form">
      <h1>Create an account</h1>
      <p class="t-muted">Already have an account? <a href="#/login">Log in</a>.</p>
      <fieldset style="margin:24px 0"><legend class="label">I am joining as</legend>
        <div class="choice-grid">
          <label class="choice"><input type="radio" name="roleChoice" value="mentee"><span class="choice-body">${icon('book')}<span><strong>A student</strong><small>High school or college. Find mentors and book sessions.</small></span></span></label>
          <label class="choice"><input type="radio" name="roleChoice" value="mentor"><span class="choice-body">${icon('briefcase')}<span><strong>A professional</strong><small>Volunteer as a mentor. Reviewed by an administrator.</small></span></span></label>
        </div></fieldset>
      <ol class="stepper" id="stepper" aria-label="Sign-up progress"></ol>
      <p class="t-meta" id="stepStatus" aria-live="polite"></p>
      <form class="form" id="regForm" novalidate>
        <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
        <div id="steps"></div>
        <div class="row-between" style="margin-top:8px">
          <button type="button" class="btn btn-tertiary" id="backBtn">${icon('arrow-left')}Back</button>
          <button type="submit" class="btn btn-primary btn-lg" id="nextBtn">Continue</button>
        </div>
      </form>
    </div></div></div>`;

  const form = $('#regForm');
  const renderSteps = () => {
    const keep = Object.fromEntries(new FormData(form)); // preserve typed values when switching role
    $('#steps').innerHTML = role === 'mentee' ? html`
      <section data-step="0"><h2 class="t-section">Your account</h2>
        ${field({ name: 'name', label: 'Full name', required: true, value: keep.name || '', attrs: 'autocomplete="name" maxlength="80"' })}
        ${field({ name: 'email', label: 'Email address', type: 'email', required: true, value: keep.email || '', hint: 'Used to log in. Mentors never see it.', attrs: 'autocomplete="email"' })}
        ${passwordField('password', 'Password', 'new-password', 'Use at least 8 characters, including a letter and a number.')}
        <ul class="t-meta" id="pwRules" aria-live="polite" style="list-style:none;padding:0"></ul></section>
      <section data-step="1" hidden><h2 class="t-section">Your interests</h2>
        ${field({ name: 'grade_level', label: 'Grade or year', required: true, options: [['', 'Choose…'], ...GRADES], value: keep.grade_level })}
        ${field({ name: 'organization', label: 'School', value: keep.organization || '', attrs: 'autocomplete="organization" maxlength="100"' })}
        ${field({ name: 'industry', label: 'Career field you’re most curious about', options: [['', 'Not sure yet'], ...INDUSTRIES], value: keep.industry })}
        ${tagInput({ name: 'interests', label: 'Academic interests', required: true, values: tags(keep.interests), suggestions: INTEREST_SUGGESTIONS, hint: 'Add subjects or topics you enjoy. Press Enter after each one.' })}</section>
      <section data-step="2" hidden><h2 class="t-section">Your goals</h2>
        ${field({ name: 'career_goals', label: 'What do you hope to get from a mentor?', type: 'textarea', rows: 4, value: keep.career_goals || '', hint: 'For example: “Learn what software engineers do every day and find a summer internship.” This helps us recommend mentors.' })}
        <fieldset class="field" data-field="preferred_format"><legend>Preferred session format</legend>
          <div class="segmented">${[['either', 'No preference'], ['video', 'Video'], ['chat', 'Chat']].map(([v, l]) => html`<label><input type="radio" name="preferred_format" value="${v}" ${raw((keep.preferred_format || 'either') === v ? 'checked' : '')}><span>${l}</span></label>`)}</div></fieldset>
        <div class="alert alert-info">${icon('lock')}<div><p><strong>Your privacy:</strong> your profile is private. Only mentors you send a request to, and administrators, can see your name, grade or year, school, interests, and goals. Your email is never shown.</p></div></div>
        <div class="field" data-field="guardianAck" id="guardianWrap" hidden><label class="check"><input type="checkbox" name="guardianAck" value="1"> I’m in high school, and a parent or guardian knows I’m using MentorshipMatch.</label><p class="field-error" aria-live="polite"></p></div>
        <div class="field" data-field="agree"><label class="check"><input type="checkbox" name="agree" value="1"> I agree to follow the <a href="#/safety" target="_blank" rel="noopener">community guidelines</a>.</label><p class="field-error" aria-live="polite"></p></div></section>`
    : html`
      <section data-step="0"><h2 class="t-section">Your account</h2>
        ${field({ name: 'name', label: 'Full name', required: true, value: keep.name || '', attrs: 'autocomplete="name" maxlength="80"' })}
        ${field({ name: 'email', label: 'Work or personal email', type: 'email', required: true, value: keep.email || '', hint: 'Used to log in and for administrator review. Students never see it.', attrs: 'autocomplete="email"' })}
        ${passwordField('password', 'Password', 'new-password', 'Use at least 8 characters, including a letter and a number.')}
        <ul class="t-meta" id="pwRules" aria-live="polite" style="list-style:none;padding:0"></ul></section>
      <section data-step="1" hidden><h2 class="t-section">Professional background</h2>
        <div class="form-2">
          ${field({ name: 'headline', label: 'Job title', required: true, value: keep.headline || '', attrs: 'maxlength="100" autocomplete="organization-title"' })}
          ${field({ name: 'organization', label: 'Employer', value: keep.organization || '', attrs: 'maxlength="100" autocomplete="organization"' })}
          ${field({ name: 'industry', label: 'Industry', required: true, options: [['', 'Choose…'], ...INDUSTRIES], value: keep.industry })}
          ${field({ name: 'years_experience', label: 'Years of experience', type: 'number', value: keep.years_experience || '', attrs: 'min="0" max="60" inputmode="numeric"' })}
        </div>
        <fieldset class="field" data-field="experience"><legend>Work experience <span class="t-meta">(optional, helps students and reviewers)</span></legend>${experienceRows()}</fieldset></section>
      <section data-step="2" hidden><h2 class="t-section">Mentoring preferences</h2>
        ${tagInput({ name: 'interests', label: 'Topics you can help with', required: true, values: tags(keep.interests), suggestions: ['career exploration', 'internships', 'college applications', 'résumé feedback', 'interview practice'] })}
        ${field({ name: 'bio', label: 'How you can help students', type: 'textarea', rows: 4, value: keep.bio || '', hint: 'A few sentences. Students read this when choosing a mentor.' })}
        <fieldset class="field" data-field="offers"><legend>Session formats you offer</legend>
          <label class="check"><input type="checkbox" name="offers_video" value="1" checked> Video calls</label>
          <label class="check"><input type="checkbox" name="offers_chat" value="1" checked> Chat sessions</label><p class="field-error" aria-live="polite"></p></fieldset>
        <div class="form-2">
          ${field({ name: 'capacity', label: 'How many students can you mentor at once?', options: [1, 2, 3, 4, 5, 6, 8, 10].map(n => [n, String(n)]), value: keep.capacity || 3 })}
          ${field({ name: 'timezone', label: 'Your time zone', options: tzOptions, value: keep.timezone || myTz })}
        </div>
        <p class="t-meta">After approval you’ll set your weekly availability, so students can only book times that work for you.</p></section>
      <section data-step="3" hidden><h2 class="t-section">Administrator review</h2>
        <div class="alert alert-info">${icon('user-check')}<div><p><strong>What happens next:</strong> an administrator reviews your professional information before students can find you. You can log in and finish your profile in the meantime. You’ll see the decision on your dashboard.</p></div></div>
        <p class="t-small">MentorshipMatch serves students, many under 18. Mentors agree to keep conversations on the platform, never ask for personal contact details, and follow the community guidelines.</p>
        <div class="field" data-field="agree"><label class="check"><input type="checkbox" name="agree" value="1"> I agree to follow the <a href="#/safety" target="_blank" rel="noopener">community guidelines</a>.</label><p class="field-error" aria-live="polite"></p></div></section>`;
    enhanceTagInputs(form);
    if (role === 'mentor' && !form.dataset.rep) { enhanceRepeaters(form); form.dataset.rep = '1'; }
    if (keep.password) form.password.value = keep.password;
  };
  const steps = () => STEPS[role];
  const show = () => {
    $$('[data-step]', form).forEach(s => { s.hidden = Number(s.dataset.step) !== step; });
    $('#stepper').innerHTML = steps().map(([label], i) => html`<li class="${i < step ? 'done' : ''}" ${raw(i === step ? 'aria-current="step"' : '')}>${label}</li>`).join('');
    $('#stepStatus').textContent = `Step ${step + 1} of ${steps().length}: ${steps()[step][0]}`;
    $('#backBtn').hidden = step === 0;
    $('#nextBtn').textContent = step === steps().length - 1 ? (role === 'mentor' ? 'Submit application' : 'Create account') : 'Continue';
    const gw = $('#guardianWrap'); if (gw) gw.hidden = !GRADES.slice(0, 4).includes(form.grade_level?.value);
  };
  const setRole = r => { role = r; step = 0; $$('[name=roleChoice]').forEach(x => { x.checked = x.value === r; }); renderSteps(); show(); };
  $$('[name=roleChoice]').forEach(x => x.addEventListener('change', () => setRole(x.value)));
  setRole(role);

  form.addEventListener('input', e => {
    if (e.target.name === 'password') $('#pwRules').innerHTML = pwRules(e.target.value).map(([ok, l]) => html`<li>${icon(ok ? 'check' : 'x')} ${l}<span class="sr-only">${ok ? ' met' : ' not yet'}</span></li>`).join('');
  });
  form.addEventListener('change', e => { if (e.target.name === 'grade_level') show(); });
  $('#backBtn').addEventListener('click', () => { clearFormErrors(form); step--; show(); $('[data-step]:not([hidden]) h2', form).setAttribute('tabindex', '-1'); $('[data-step]:not([hidden]) h2', form).focus(); });

  // Client-side checks for the current step (the server checks everything again).
  const validate = v => {
    const need = steps()[step][1];
    const err = (f, m) => ({ field: f, message: m });
    if (need.includes('name') && v.name.trim().length < 2) return err('name', 'Enter your full name.');
    if (need.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) return err('email', 'Enter a valid email address, like name@example.com.');
    if (need.includes('password') && pwRules(v.password).some(([ok]) => !ok)) return err('password', 'Use at least 8 characters, including a letter and a number.');
    if (need.includes('grade_level') && !v.grade_level) return err('grade_level', 'Choose your current grade or year.');
    if (need.includes('interests') && !v.interests) return err('interests', role === 'mentor' ? 'Add at least one topic you can help with.' : 'Add at least one academic interest.');
    if (need.includes('headline') && !v.headline.trim()) return err('headline', 'Enter your job title.');
    if (need.includes('industry') && role === 'mentor' && !v.industry) return err('industry', 'Choose your industry.');
    if (need.includes('offers') && !v.offers_video && !v.offers_chat) return err('offers', 'Offer at least one session format.');
    if (need.includes('guardianAck') && GRADES.slice(0, 4).includes(v.grade_level) && !v.guardianAck) return err('guardianAck', 'High school students need a parent or guardian to know they are using MentorshipMatch.');
    if (need.includes('agree') && !v.agree) return err('agree', 'Please agree to the community guidelines to continue.');
    return null;
  };

  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(form);
    const v = Object.fromEntries(new FormData(form));
    const problem = validate(v);
    if (problem) return showFormError(form, problem);
    if (step < steps().length - 1) { step++; show(); const h = $('[data-step]:not([hidden]) h2', form); h.setAttribute('tabindex', '-1'); h.focus(); return; }
    const profile = role === 'mentee'
      ? { grade_level: v.grade_level, organization: v.organization, industry: v.industry, interests: tags(v.interests), career_goals: v.career_goals, preferred_format: v.preferred_format }
      : { headline: v.headline, organization: v.organization, industry: v.industry, years_experience: v.years_experience, experience: readRepeat(form, 'experience'),
          interests: tags(v.interests), bio: v.bio, offers_video: !!v.offers_video, offers_chat: !!v.offers_chat, capacity: v.capacity, timezone: v.timezone };
    try {
      const user = await withBusy($('#nextBtn'), () => api('/auth/register', { method: 'POST', body: { role, name: v.name, email: v.email, password: v.password, agree: !!v.agree, guardianAck: !!v.guardianAck, profile } }));
      toast(role === 'mentor' ? 'Application submitted. An administrator will review it.' : 'Welcome to MentorshipMatch!');
      afterLogin(user);
    } catch (err) {
      // Jump back to the step that contains the field the server flagged.
      const i = steps().findIndex(([, fields]) => fields.includes(err.field));
      if (i >= 0 && i !== step) { step = i; show(); }
      showFormError(form, err);
    }
  });
}, { title: 'Create an account', layout: 'public' });
