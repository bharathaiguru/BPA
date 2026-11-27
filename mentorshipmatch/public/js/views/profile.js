/* views/profile.js — My profile (spec §16): logical sections, structured fields (tags and
   repeatable résumé rows instead of comma/pipe text), accurate completion and visibility,
   unsaved-change protection, and password change. Plus the mentor Availability editor. */
'use strict';

const GRADE_OPTIONS = ['9th grade', '10th grade', '11th grade', '12th grade', 'College freshman', 'College sophomore', 'College junior', 'College senior'];
const TZ_LIST = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];
const tzOpts = cur => [...new Set([cur, Intl.DateTimeFormat().resolvedOptions().timeZone, ...TZ_LIST].filter(Boolean))].map(z => [z, z.replace(/_/g, ' ')]);

MM.route('/profile', async () => {
  const u = MM.state.user;
  if (u.role === 'admin') return MM.go('#/admin');
  const p = await api('/profile');
  MM.state.profile = p;
  const mentor = u.role === 'mentor';
  const visibility = mentor
    ? (p.approval_status === 'approved' ? 'Your profile is visible to students and visitors browsing mentors. Your email is never shown.' : 'Your profile will become visible to students after an administrator approves your application. Your email is never shown.')
    : 'Your profile is private. Only mentors you send a request to, and administrators, can see it. Your email is never shown.';

  $('#main').innerHTML = html`
    <div class="page-head"><div class="row">${avatar(p.name, u.id, 'lg')}<div><h1 class="t-app-title mb-0">My profile</h1><p>${mentor ? 'Mentor' : 'Student'} · ${p.email}</p></div></div>
      <a class="btn btn-secondary" href="#/users/${u.id}">${icon('eye')}Preview ${mentor ? 'public profile' : 'what mentors see'}</a></div>
    <div class="alert alert-info" style="margin-bottom:16px">${icon(mentor ? 'eye' : 'lock')}<p>${visibility}</p></div>
    ${p.completion ? html`<div class="card" style="margin-bottom:32px"><div class="row-between"><strong>Profile ${p.completion.percent}% complete</strong>
        <span class="t-meta">${p.completion.missing.length ? `Missing: ${p.completion.missing.map(x => x.label.toLowerCase()).join(', ')}` : 'Everything students and mentors look for is filled in.'}</span></div>
      <div class="progress" style="margin-top:8px" role="progressbar" aria-valuenow="${p.completion.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completion"><span style="width:${p.completion.percent}%"></span></div></div>` : ''}

    <form id="profileForm" class="stack-lg" novalidate style="max-width:820px">
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      <section aria-labelledby="ps1"><h2 id="ps1" class="t-section">Personal information</h2><div class="form-2">
        ${field({ name: 'name', label: 'Full name', required: true, value: p.name, attrs: 'maxlength="80" autocomplete="name"' })}
        ${mentor ? html`
          ${field({ name: 'headline', label: 'Job title', required: true, value: p.headline, attrs: 'maxlength="100"' })}
          ${field({ name: 'organization', label: 'Employer', value: p.organization, attrs: 'maxlength="100"' })}
          ${field({ name: 'years_experience', label: 'Years of experience', type: 'number', value: p.years_experience || '', attrs: 'min="0" max="60" inputmode="numeric"' })}
          ${field({ name: 'industry', label: 'Industry', required: true, options: [['', 'Choose…'], ...INDUSTRIES], value: p.industry })}`
        : html`
          ${field({ name: 'grade_level', label: 'Grade or year', required: true, options: [['', 'Choose…'], ...GRADE_OPTIONS], value: p.grade_level })}
          ${field({ name: 'organization', label: 'School', value: p.organization, attrs: 'maxlength="100"' })}
          ${field({ name: 'industry', label: 'Career field you’re most curious about', options: [['', 'Not sure yet'], ...INDUSTRIES], value: p.industry })}`}
      </div></section>

      <section aria-labelledby="ps2"><h2 id="ps2" class="t-section">${mentor ? 'Expertise' : 'Interests'}</h2><div class="stack">
        ${mentor ? html`${tagInput({ name: 'interests', label: 'Mentoring topics', required: true, values: tags(p.interests), hint: 'What students can ask you about. Press Enter after each one.' })}
          ${tagInput({ name: 'skills', label: 'Skills', values: tags(p.skills), max: 15 })}`
        : tagInput({ name: 'interests', label: 'Academic interests', required: true, values: tags(p.interests), suggestions: ['computer science', 'medicine', 'engineering', 'business', 'law', 'research'].filter(x => !tags(p.interests).includes(x)) })}
      </div></section>

      ${mentor ? '' : html`<section aria-labelledby="ps3"><h2 id="ps3" class="t-section">Goals</h2><div class="stack">
        ${field({ name: 'career_goals', label: 'What you want to accomplish', type: 'textarea', rows: 4, value: p.career_goals, hint: 'Mentors read this first. It also improves your recommendations.' })}
        <fieldset class="field" data-field="preferred_format"><legend>Preferred session format</legend><div class="segmented">${[['either', 'No preference'], ['video', 'Video'], ['chat', 'Chat']].map(([v, l]) => html`<label><input type="radio" name="preferred_format" value="${v}" ${raw((p.preferred_format || 'either') === v ? 'checked' : '')}><span>${l}</span></label>`)}</div></fieldset>
      </div></section>`}

      <section aria-labelledby="ps4"><h2 id="ps4" class="t-section">${mentor ? 'How you can help' : 'About you'}</h2>
        ${field({ name: 'bio', label: mentor ? 'Introduction for students' : 'A short introduction', type: 'textarea', rows: 4, value: p.bio, hint: mentor ? 'Two or three sentences. Shown at the top of your profile.' : 'Optional. Share what you enjoy and what you’re working on.' })}</section>

      ${mentor ? html`
        <section aria-labelledby="ps5"><h2 id="ps5" class="t-section">Professional experience</h2>${experienceRows(p.experience_list)}</section>
        <section aria-labelledby="ps6"><h2 id="ps6" class="t-section">Education</h2>${lineRows('education', p.education_list, 'Degree or program', 'B.S. Computer Science — University of Texas at Dallas')}</section>
        <section aria-labelledby="ps7"><h2 id="ps7" class="t-section">Achievements &amp; certifications</h2>${lineRows('achievements', p.achievements_list, 'Achievement', 'Licensed Professional Engineer (P.E.)')}</section>
        <section aria-labelledby="ps8"><h2 id="ps8" class="t-section">Mentoring style</h2>
          ${field({ name: 'mentoring_style', label: 'How you like to run sessions', type: 'textarea', rows: 3, value: p.mentoring_style, attrs: 'maxlength="400"' })}</section>
        <section aria-labelledby="ps9"><h2 id="ps9" class="t-section">Mentoring settings</h2><div class="stack">
          <fieldset class="field" data-field="offers"><legend>Session formats</legend>
            <label class="check"><input type="checkbox" name="offers_video" value="1" ${raw(p.offers_video ? 'checked' : '')}> Video calls</label>
            <label class="check"><input type="checkbox" name="offers_chat" value="1" ${raw(p.offers_chat ? 'checked' : '')}> Chat sessions</label><p class="field-error" aria-live="polite"></p></fieldset>
          <fieldset class="field" data-field="durations"><legend>Session lengths you offer</legend>
            <div class="row">${[30, 45, 60].map(d => html`<label class="check"><input type="checkbox" name="durations" value="${d}" ${raw(p.durations_list.includes(d) ? 'checked' : '')}> ${d} minutes</label>`)}</div><p class="field-error" aria-live="polite"></p></fieldset>
          <div class="form-2">
            ${field({ name: 'capacity', label: 'Maximum active mentees', options: [1, 2, 3, 4, 5, 6, 8, 10].map(n => [n, String(n)]), value: p.capacity, hint: `You currently mentor ${p.capacityInfo.active}.` })}
            ${field({ name: 'timezone', label: 'Your time zone', options: tzOpts(p.timezone), value: p.timezone })}
          </div>
          <div class="switch-row" style="max-width:520px"><span class="switch-label" id="accl">Accepting new requests<small>Pause anytime. Current mentees are not affected.</small></span>
            <span class="switch"><input type="checkbox" name="accepting" value="1" role="switch" aria-labelledby="accl" ${raw(p.accepting ? 'checked' : '')}><span></span></span></div>
          <p class="t-small"><a href="#/availability">Edit weekly availability</a> (${fmt.plural(p.availability.length, 'window')} set)</p>
        </div></section>` : ''}

      <div class="card raised row-between" style="position:sticky;bottom:16px;z-index:5">
        <span id="dirtyNote" class="t-small t-muted" aria-live="polite">No unsaved changes</span>
        <button class="btn btn-primary" type="submit">Save changes</button></div>
    </form>

    <section class="section-divider" aria-labelledby="ps10" style="max-width:820px"><h2 id="ps10" class="t-section">Privacy and account</h2>
      <p class="t-small">${visibility}</p>
      <form id="pwForm" class="form" novalidate style="max-width:420px">
        <h3 class="t-card">Change password</h3>
        <div class="alert alert-ok form-ok" role="status" hidden></div>
        ${passwordField('current', 'Current password', 'current-password')}
        ${passwordField('next', 'New password', 'new-password', 'At least 8 characters, including a letter and a number.')}
        <button class="btn btn-secondary" type="submit">Update password</button>
      </form></section>`;

  const form = $('#profileForm');
  enhanceTagInputs(form); enhanceRepeaters(form);
  let dirty = false;
  const markDirty = () => { if (!dirty) { dirty = true; $('#dirtyNote').textContent = 'You have unsaved changes'; } };
  form.addEventListener('input', markDirty); form.addEventListener('change', markDirty);
  form.addEventListener('click', e => { if (e.target.closest('[data-add-row],[data-remove-row],.tag-input button,[data-suggest]')) markDirty(); });
  MM.leaveGuard = () => dirty && document.contains(form) ? 'You have unsaved profile changes. Leave without saving?' : null;

  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(form);
    const fd = new FormData(form), v = Object.fromEntries(fd);
    const body = { ...v, interests: tags(v.interests), skills: tags(v.skills) };
    if (mentor) Object.assign(body, {
      experience: readRepeat(form, 'experience'), education: readRepeat(form, 'education'), achievements: readRepeat(form, 'achievements'),
      durations: fd.getAll('durations').map(Number), offers_video: !!v.offers_video, offers_chat: !!v.offers_chat, accepting: !!v.accepting,
    });
    try {
      const saved = await withBusy(form.querySelector('[type=submit]'), () => api('/profile', { method: 'PUT', body }));
      MM.state.user.name = saved.name; MM.state.profile = saved; dirty = false;
      $('#dirtyNote').textContent = `Saved at ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      toast('Profile saved.');
    } catch (err) { showFormError(form, err); }
  });

  const pw = $('#pwForm');
  pw.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(pw);
    const v = Object.fromEntries(new FormData(pw));
    try {
      await withBusy(pw.querySelector('[type=submit]'), () => api('/auth/password', { method: 'POST', body: v }));
      pw.reset(); const ok = $('.form-ok', pw); ok.hidden = false; ok.innerHTML = html`${icon('check-circle')}<p>Password updated.</p>`.s;
    } catch (err) { showFormError(pw, err); }
  });
}, { auth: true, title: 'My profile' });
window.addEventListener('beforeunload', e => { if (MM.leaveGuard?.()) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Availability (mentors) ----------
MM.route('/availability', async () => {
  const p = await api('/profile');
  const byDay = WEEKDAYS.map((_, i) => p.availability.filter(w => w.weekday === i));
  const row = (d, w = { start: '17:00', end: '19:00' }) => html`<div class="row" data-win style="gap:8px;margin-bottom:8px">
    <label class="sr-only" for="s${d}${++fieldSeq}">${WEEKDAYS[d]} start</label><input class="input" style="width:150px" type="time" step="900" id="s${d}${fieldSeq}" data-start value="${w.start}">
    <span aria-hidden="true">to</span>
    <label class="sr-only" for="e${d}${fieldSeq}">${WEEKDAYS[d]} end</label><input class="input" style="width:150px" type="time" step="900" id="e${d}${fieldSeq}" data-end value="${w.end}">
    <button type="button" class="icon-btn" data-rm-win aria-label="Remove ${WEEKDAYS[d]} window">${icon('trash')}</button></div>`;
  $('#main').innerHTML = html`${pageHead('Availability', 'Set the weekly times students can book. Students only see open times inside these windows that don’t overlap your other sessions.')}
    <form id="availForm" novalidate style="max-width:760px">
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      <div style="max-width:360px;margin-bottom:24px">${field({ name: 'timezone', label: 'Your time zone', options: tzOpts(p.timezone), value: p.timezone, required: true, hint: 'Windows below are in this time zone. Students see times converted to theirs.' })}</div>
      <div class="table-wrap"><table><caption class="sr-only">Weekly availability</caption>
        <thead><tr><th scope="col" style="width:140px">Day</th><th scope="col">Time windows</th></tr></thead>
        <tbody>${WEEKDAYS.map((d, i) => html`<tr><th scope="row" style="background:none;text-transform:none;letter-spacing:0;font-size:var(--fs-small);color:var(--ink)">${d}</th>
          <td><div data-day="${i}">${byDay[i].map(w => row(i, w))}</div>
            <button type="button" class="btn btn-tertiary btn-sm" data-add-win="${i}">${icon('plus')}Add time on ${d}</button></td></tr>`)}</tbody></table></div>
      <div class="row" style="margin-top:24px"><button class="btn btn-primary" type="submit">Save availability</button><span class="t-small t-muted" id="availNote" aria-live="polite"></span></div>
    </form>`;
  const form = $('#availForm');
  form.addEventListener('click', e => {
    const add = e.target.closest('[data-add-win]');
    if (add) { const box = $(`[data-day="${add.dataset.addWin}"]`, form); box.insertAdjacentHTML('beforeend', row(Number(add.dataset.addWin)).s); box.lastElementChild.querySelector('input').focus(); }
    const rm = e.target.closest('[data-rm-win]');
    if (rm) { const td = rm.closest('td'); rm.closest('[data-win]').remove(); td.querySelector('[data-add-win]').focus(); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(form);
    const windows = $$('[data-day]', form).flatMap(box => $$('[data-win]', box).map(w => ({ weekday: Number(box.dataset.day), start: $('[data-start]', w).value, end: $('[data-end]', w).value })));
    try {
      await withBusy(form.querySelector('[type=submit]'), () => api('/profile/availability', { method: 'PUT', body: { windows, timezone: form.timezone.value } }));
      $('#availNote').textContent = `Saved. ${fmt.plural(windows.length, 'weekly window')}.`;
      toast('Availability saved.');
    } catch (err) { showFormError(form, err); }
  });
}, { auth: true, roles: ['mentor'], title: 'Availability' });
