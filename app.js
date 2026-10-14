/* מדד הסבל המילואימניקי – לוגיקת המשחק. בלי שרת, בלי build. */
(function () {
  'use strict';

  const SERVICE_DAYS = 80;
  const ROLE_BASE_POINTS = 20; // נקודות לכל יחידת base של תפקיד

  /* הדרגות נקבעות לפי היחס בין הציון שלך לממוצע המשוער של התפקיד שלך */
  const TIERS = [
    { upTo: 0.4, label: 'מילואים? איפה?', title: 'תייר', text: 'הבסיס היה בשבילך בית הארחה. תשאיר ביקורת בגוגל.' },
    { upTo: 0.75, label: 'פנסיונר פלוגתי', title: 'פנסיונר', text: 'שתית יותר קפה ממה ששמרת. וזה בסדר. בערך.' },
    { upTo: 1.05, label: 'מילואימניק מצוי', title: 'מצוי', text: 'עשית את שלך, התלוננת במידה, אכלת שניצל.' },
    { upTo: 1.35, label: 'עמוד התווך של השבצ"ק', title: 'עמוד תווך', text: 'כשמחפשים מישהו למשמרת, השם שלך עולה ראשון.' },
    { upTo: 1.7, label: 'קורבן מערכת', title: 'קורבן', text: 'השבצ"ק מכיר אותך אישית. ולא לטובה.' },
    { upTo: 2.1, label: 'הלם — רוח הרפאים של הבונקר', title: 'הלם', text: 'ההקרבה שלך ראויה לטקס בכיכר הפלוגה.' },
    { upTo: Infinity, label: 'אגדה — שבר את השבצ"ק', title: 'אגדה', text: 'המדד לא נבנה בשבילך. מישהו תביא לו יום חופש. ובמבה.' },
  ];
  const MORDECHAI_TIER = { label: 'מרדכי — חמ"ל וחובש', title: 'מרדכי', text: 'שני תפקידים, גוף אחד, אפס מנוחה. כל הפלוגה חייבת לך.' };

  const DNA_LABELS = { palmer: 'פלמר', tzabari: 'צברי', basos: 'בסוס', mahlaka1: 'מחלקה 1', poker: 'פוקר' };

  /* ───────── בחירת השאלות ───────── */
  const params = new URLSearchParams(location.search);
  function selectBank() {
    if (params.get('all') === '1') return QUESTION_BANK.slice();
    const only = params.get('q');
    if (only) {
      return only
        .split(',')
        .map((id) => QUESTION_BANK.find((q) => q.id === id.trim()))
        .filter(Boolean);
    }
    return QUESTION_BANK.filter((q) => q.enabled);
  }
  const BANK = selectBank();
  const ALL = [...PROFILE_QUESTIONS, ...BANK, ...FIXED_SLIDERS];

  function buildSections() {
    const sections = [{ title: 'מי אתה', sub: 'תת-הקבוצה שלך קובעת את המכפיל', items: PROFILE_QUESTIONS }];
    for (const [key, c] of Object.entries(CATEGORIES)) {
      const items = BANK.filter((q) => q.category === key);
      if (items.length) sections.push({ title: c.label, items });
    }
    sections.push({ title: 'DNA פלוגתי', sub: 'השאלות הקבועות. כנות מלאה, בבקשה.', items: FIXED_SLIDERS });
    return sections;
  }

  /* ───────── חישוב ───────── */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const catWeight = (q) => (q.category ? CATEGORIES[q.category].weight : 1);
  const painToPoints = (q, pain) => Math.round(pain * 10 * (q.weight || 1) * catWeight(q));

  function scalePain(q, n) {
    let pain = q.scale[0][1];
    for (const [threshold, p] of q.scale) if (n >= threshold) pain = p;
    return pain;
  }

  // מחזיר נקודות לשאלה, או null אם לא נענתה
  function questionPoints(q, a) {
    if (a === undefined || a === null || a === '') return null;
    switch (q.type) {
      case 'single':
        if (!q.category) return null;
        return painToPoints(q, clamp(q.options[a].pain ?? 0, 0, 10));
      case 'multi':
        if (!a.length) return null;
        return painToPoints(q, clamp(a.reduce((s, i) => s + (q.options[i].pain ?? 0), q.baseline || 0), 0, 10));
      case 'number':
        if (q.pointsPerUnit) return Number(a) * q.pointsPerUnit;
        return painToPoints(q, clamp(scalePain(q, Number(a)), 0, 10));
      case 'slider':
        if (q.pointsPerPoint !== undefined) return Math.round(q.pointsPerPoint * Number(a));
        return painToPoints(q, clamp((q.baseline || 0) + q.painPerPoint * Number(a), 0, 10));
      case 'bonus':
        if (!a.length) return null;
        return a.reduce((s, i) => s + q.options[i].points, 0);
      default:
        return null;
    }
  }

  function expectedPain(q) {
    switch (q.type) {
      case 'single':
        return q.options.reduce((s, o) => s + clamp(o.pain ?? 0, 0, 10), 0) / q.options.length;
      case 'multi':
        return 5;
      case 'number':
        return q.scale.reduce((s, [, p]) => s + p, 0) / q.scale.length;
      case 'slider':
        return clamp((q.baseline || 0) + q.painPerPoint * 5.5, 0, 10);
      default:
        return 0;
    }
  }

  const profileOpt = (answers, id) => {
    const q = PROFILE_QUESTIONS.find((p) => p.id === id);
    const a = answers[id];
    return a === undefined || !q.options ? {} : q.options[a];
  };

  // "ממוצע משוער" לתת-הקבוצה: כל שאלה נענית בתשובה ממוצעת, עם המכפיל של התפקיד
  function roleBaseline(answers) {
    const role = profileOpt(answers, 'role');
    let sum = 0;
    for (const q of BANK) if (q.category && q.type !== 'bonus') sum += painToPoints(q, expectedPain(q));
    return Math.round(sum * (role.mult ?? 1) + (role.base ?? 0) * ROLE_BASE_POINTS);
  }

  function computeResult(answers) {
    const cats = {};
    let bonus = 0;
    let extra = 0;
    for (const q of ALL) {
      const pts = questionPoints(q, answers[q.id]);
      if (pts === null) continue;
      if (q.type === 'bonus') bonus += pts;
      else if (q.category) {
        cats[q.category] = cats[q.category] || { pts: 0, max: 0 };
        cats[q.category].pts += pts;
        cats[q.category].max += painToPoints(q, 10);
      } else extra += pts; // ילדים, פוקר
    }
    const role = profileOpt(answers, 'role');
    const marital = profileOpt(answers, 'marital');
    const catSum = Object.values(cats).reduce((s, c) => s + c.pts, 0);
    const score = Math.max(
      0,
      Math.round(catSum * (role.mult ?? 1) * (marital.mult ?? 1) + (role.base ?? 0) * ROLE_BASE_POINTS + extra + bonus)
    );
    const breakdown = Object.entries(cats).map(([key, c]) => ({
      key,
      label: CATEGORIES[key].label,
      pct: Math.round((c.pts / c.max) * 100),
    }));
    const dna = {};
    for (const s of FIXED_SLIDERS) if (answers[s.id] !== undefined) dna[s.id] = Number(answers[s.id]);
    return {
      score,
      baseline: roleBaseline(answers),
      breakdown,
      dna,
      role: role.label,
      roleValue: role.value,
      platoon: profileOpt(answers, 'platoon').label,
      marital: marital.label,
      kids: answers.kids,
      started: catSum + bonus + extra > 0 || role.label !== undefined,
    };
  }

  function tierFor(r) {
    if (r.roleValue === 'mordechai') return MORDECHAI_TIER;
    const ratio = r.baseline ? r.score / r.baseline : 0;
    return TIERS.find((t) => ratio <= t.upTo);
  }

  function dnaHeadline(dna) {
    const keys = ['palmer', 'tzabari', 'basos', 'mahlaka1'].filter((k) => dna[k] !== undefined);
    if (!keys.length) return '';
    const top = keys.reduce((a, b) => (dna[b] > dna[a] ? b : a));
    if (dna[top] <= 3) return 'לא פלמר, לא צברי, לא בסוס ולא מחלקה 1. מי אתה בכלל?';
    if (keys.length === 4 && keys.every((k) => dna[k] >= 8)) return 'אתה כולם. אתה הפלוגה.';
    return `בעיקר ${DNA_LABELS[top]} (${dna[top]}/10)`;
  }

  /* ───────── שיתוף ───────── */
  const encode = (obj) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const decode = (str) => JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));

  function sharePayload(r, answers) {
    return {
      n: String(answers.name || '').slice(0, 40),
      s: r.score,
      bl: r.baseline,
      r: r.role,
      rv: r.roleValue,
      p: r.platoon,
      m: r.marital,
      k: r.kids,
      b: r.breakdown.map((x) => [x.key, x.pct]),
      d: r.dna,
      t: ALL.filter((q) => q.type === 'text' && q.id !== 'name' && answers[q.id]).map((q) => [
        q.id,
        String(answers[q.id]).slice(0, 140),
      ]),
    };
  }

  function fromPayload(o) {
    return {
      name: o.n,
      score: o.s,
      baseline: o.bl,
      role: o.r,
      roleValue: o.rv,
      platoon: o.p,
      marital: o.m,
      kids: o.k,
      breakdown: (o.b || []).filter(([k]) => CATEGORIES[k]).map(([key, pct]) => ({ key, label: CATEGORIES[key].label, pct })),
      dna: o.d || {},
      quotes: o.t || [],
      started: true,
    };
  }

  /* ───────── עזרי UI ───────── */
  const app = document.getElementById('app');
  let answers = {};
  let shared = null; // תוצאה של חבר שנפתחה מקישור

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => String(Math.round(Number(n)));
  const signed = (n) => `<bdi dir="ltr">${n < 0 ? `−${fmt(-n)}` : `+${fmt(n)}`}</bdi>`;
  // טקסט עם שעות: מבודד טווחי שעות כדי שלא יתהפכו בעברית
  const rich = (s) => esc(s).replace(/\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?/g, (m) => `<bdi dir="ltr">${m}</bdi>`);

  // "כותרת (הערה)" → כותרת + שורת משנה
  function splitLabel(o) {
    if (o.sub) return [o.label, o.sub];
    const m = String(o.label).match(/^(.*?)\s*\((.+)\)$/);
    return m ? [m[1], m[2]] : [o.label, ''];
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function friend() {
    try {
      return JSON.parse(sessionStorage.getItem('friend') || 'null');
    } catch (e) {
      return null;
    }
  }

  const ICON_SHARE =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const ICON_RESET =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>';
  const ICON_ADD =
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v9M7.5 12h9"/></svg>';
  const ICON_CHECK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

  /* ───────── רינדור שאלות ───────── */
  function optionBadge(q, o) {
    if (o.mult !== undefined) return `<bdi dir="ltr">×${o.mult}</bdi>`;
    if (q.type === 'bonus') return signed(o.points);
    if (!q.category) return '';
    return signed(painToPoints(q, clamp(o.pain ?? 0, -10, 10)));
  }

  function renderOptions(q) {
    const a = answers[q.id];
    const isMulti = q.type === 'multi';

    if (q.display === 'segmented') {
      return `<div class="segmented" role="radiogroup">${q.options
        .map((o, i) => `<button class="seg ${a === i ? 'on' : ''}" data-i="${i}" role="radio" aria-checked="${a === i}">${esc(o.label)}</button>`)
        .join('')}</div>`;
    }

    const scroll = q.options.length > 6 ? 'scroll' : '';
    const cols = q.options.length === 4 ? 'cols-2' : '';
    return `<div class="cards ${scroll} ${cols}">${q.options
      .map((o, i) => {
        const on = isMulti ? (a || []).includes(i) : a === i;
        const [title, sub] = splitLabel(o);
        const badge = optionBadge(q, o);
        return `<button class="opt ${on ? 'on' : ''}" data-i="${i}" role="${isMulti ? 'checkbox' : 'radio'}" aria-checked="${on}">
          ${on ? `<span class="check">${ICON_CHECK}</span>` : ''}
          ${badge ? `<span class="badge">${badge}</span>` : ''}
          <span class="opt-title">${rich(title)}</span>
          ${sub ? `<span class="opt-sub">${rich(sub)}</span>` : ''}
        </button>`;
      })
      .join('')}</div><div class="gate-slot"></div>`;
  }

  function renderBonus(q) {
    const a = answers[q.id] || [];
    return `<div class="bonus-list">${q.options
      .map((o, i) => {
        const on = a.includes(i);
        return `<button class="bonus ${on ? 'on' : ''}" data-i="${i}" role="checkbox" aria-checked="${on}">
          <span class="bonus-text"><span class="bonus-title">${rich(o.label)}</span><span class="bonus-sub">${rich(o.sub || '')}</span><span class="bonus-pts">${signed(o.points)} נקודות</span></span>
          <span class="bonus-icon">${on ? ICON_CHECK : ICON_ADD}</span>
        </button>`;
      })
      .join('')}</div>`;
  }

  function pointsLine(q) {
    const pts = questionPoints(q, answers[q.id]);
    if (pts === null || pts === 0) return '<div class="pts-line muted-pts">&nbsp;</div>';
    return `<div class="pts-line">${signed(pts)} נקודות</div>`;
  }

  function renderCounter(q) {
    const v = answers[q.id] ?? 0;
    return `<div class="counter">
        <button class="cbtn minus" data-d="-1" aria-label="פחות" ${v <= 0 ? 'disabled' : ''}>−</button>
        <span class="cval">${v}</span>
        <button class="cbtn plus" data-d="1" aria-label="יותר">+</button>
      </div>${pointsLine(q)}`;
  }

  function renderSlider(q) {
    const touched = answers[q.id] !== undefined;
    const v = touched ? answers[q.id] : 5;
    return `<div class="slider ${touched ? '' : 'untouched'}">
        <input type="range" min="1" max="10" step="1" value="${v}" aria-label="${esc(q.text)}" style="--p:${((v - 1) / 9) * 100}%" />
        <div class="ticks"><span>1 · ${esc(q.minLabel || '')}</span><span>${esc(q.maxLabel || '')} · 10</span></div>
      </div>${pointsLine(q)}`;
  }

  function renderQuestion(q) {
    let body = '';
    let big = '';
    if (q.type === 'single' || q.type === 'multi') body = renderOptions(q);
    else if (q.type === 'bonus') body = renderBonus(q);
    else if (q.type === 'number') body = renderCounter(q);
    else if (q.type === 'slider') {
      body = renderSlider(q);
      big = `<span class="big-val">${answers[q.id] ?? '–'}</span>`;
    } else if (q.type === 'text') {
      const area = q.id === 'name' ? 'input' : 'textarea';
      body =
        area === 'input'
          ? `<input class="text" maxlength="40" placeholder="${esc(q.placeholder || '')}" value="${esc(answers[q.id] ?? '')}" />`
          : `<textarea class="text" maxlength="140" placeholder="${esc(q.placeholder || '')}">${esc(answers[q.id] ?? '')}</textarea>`;
    }
    const boxed = q.type === 'slider' || q.type === 'number';
    let [title, hint] = q.hint ? [q.text, q.hint] : splitLabel({ label: q.text });
    if (!hint && q.type === 'multi') hint = 'אפשר לבחור כמה';
    if (hint === 'אפשר כמה') hint = 'אפשר לבחור כמה';
    return `<div class="q ${boxed ? 'boxed' : ''}" data-id="${q.id}">
        <div class="q-head"><div><div class="q-title">${rich(title)}</div>${hint ? `<div class="q-hint">${rich(hint)}</div>` : ''}</div>${big}</div>
        ${body}
      </div>`;
  }

  function bindQuestion(el, q) {
    const rerender = () => {
      el.outerHTML = renderQuestion(q);
      const fresh = app.querySelector(`.q[data-id="${q.id}"]`);
      bindQuestion(fresh, q);
      update();
      return fresh;
    };

    el.querySelectorAll('[data-i]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        if (q.type === 'multi' || q.type === 'bonus') {
          const cur = new Set(answers[q.id] || []);
          cur.has(i) ? cur.delete(i) : cur.add(i);
          answers[q.id] = [...cur].sort((x, y) => x - y);
          rerender();
        } else if (q.options[i].mordechaiOnly && answers[q.id] !== i) {
          askMordechai(el, q, i, rerender);
        } else {
          answers[q.id] = answers[q.id] === i && q.category ? undefined : i;
          rerender();
        }
      };
    });

    el.querySelectorAll('.cbtn').forEach((btn) => {
      btn.onclick = () => {
        const step = q.step || 1;
        const v = clamp((answers[q.id] ?? 0) + Number(btn.dataset.d) * step, 0, q.max ?? 50);
        answers[q.id] = v;
        rerender();
      };
    });

    const range = el.querySelector('input[type=range]');
    if (range) {
      range.oninput = () => {
        answers[q.id] = Number(range.value);
        range.style.setProperty('--p', `${((range.value - 1) / 9) * 100}%`);
        el.querySelector('.big-val').textContent = range.value;
        el.querySelector('.slider').classList.remove('untouched');
        el.querySelector('.pts-line').outerHTML = pointsLine(q);
        update();
      };
    }

    const text = el.querySelector('.text');
    if (text) {
      text.oninput = () => {
        answers[q.id] = text.value.trim();
        update();
      };
    }
  }

  function askMordechai(el, q, i, rerender) {
    const slot = el.querySelector('.gate-slot');
    slot.innerHTML = `<div class="gate"><b>רגע רגע. אתה מרדכי?</b>
        <div class="gate-btns"><button class="pill dark" data-yes>כן, אני מרדכי</button><button class="pill" data-no>לא...</button></div></div>`;
    slot.querySelector('[data-yes]').onclick = () => {
      answers[q.id] = i;
      if (!answers.name) {
        answers.name = 'מרדכי';
        const nameInput = app.querySelector('.q[data-id="name"] .text');
        if (nameInput) nameInput.value = 'מרדכי';
      }
      rerender();
    };
    slot.querySelector('[data-no]').onclick = () => {
      slot.innerHTML = '<div class="gate">התפקיד הזה שמור למרדכי בלבד. יש רק מרדכי אחד. בחר תפקיד אחר 🙃</div>';
    };
  }

  /* ───────── עמוד ───────── */
  function heroHTML(r, mode) {
    const tier = r.started ? tierFor(r) : null;
    const ratio = r.baseline ? r.score / r.baseline : 0;
    const width = clamp((ratio / 2.2) * 100, 0, 100);
    const f = mode === 'play' ? friend() : null;

    let compare = '';
    if (f && r.started) {
      const d = r.score - f.score;
      const who = esc(f.name || 'החבר שלך');
      compare = d === 0 ? `תיקו מושלם עם ${who}` : d > 0 ? `סבלת ${fmt(d)} נקודות יותר מ${who}` : `${who} סבל ${fmt(-d)} נקודות יותר ממך`;
    } else if (r.started && r.baseline) {
      const pct = Math.round((ratio - 1) * 100);
      const group = r.role ? `ל${r.role}` : 'לחייל בפלוגה';
      compare = pct === 0 ? `בדיוק בממוצע המשוער ${group}` : `הציון ${mode === 'shared' ? 'הזה' : 'שלך'} ${pct > 0 ? 'גבוה' : 'נמוך'} ב-${Math.abs(pct)}% מהממוצע המשוער ${group}`;
    } else if (f) {
      compare = `${esc(f.name || 'חבר מהפלוגה')} קיבל ${fmt(f.score)}. בוא נראה אם סבלת יותר.`;
    }

    const caption = mode === 'shared' ? `מדד הסבל של ${esc(r.name || 'חבר מהפלוגה')}` : 'דירוג הסבל הסופי';
    return `
      <div class="caption">${caption}</div>
      <div class="score-wrap"><div class="score" id="hero-score">${fmt(r.score)}</div></div>
      <div class="line"><div style="width:${width}%"></div></div>
      <div class="tier-label">${tier ? esc(tier.label) : `${SERVICE_DAYS} יום · פלוגה אחת · שבצ"ק אחד`}</div>
      <div class="headline">${tier ? esc(tier.text) : 'כולם עברו את אותם 80 יום. אבל מישהו סבל יותר. מגללים למטה, עונים, והמדד עולה.'}</div>
      ${compare ? `<div class="compare">${compare}</div>` : ''}
      <div class="round-btns">
        ${mode === 'shared'
          ? '<button class="pill dark wide" id="play">גם אני רוצה לדעת כמה סבלתי</button>'
          : `<button class="round dark" id="share-hero" aria-label="שיתוף">${ICON_SHARE}</button><button class="round" id="reset" aria-label="התחלה מחדש">${ICON_RESET}</button>`}
      </div>`;
  }

  function summaryHTML(r, quotes) {
    const bars = (rows) =>
      rows
        .map((b) => `<div class="bar"><span>${esc(b.label)}</span><div class="track"><div style="width:${b.pct}%"></div></div><span class="val">${b.pct}</span></div>`)
        .join('');
    const dnaRows = Object.keys(DNA_LABELS)
      .filter((k) => r.dna[k] !== undefined)
      .map((k) => ({ label: DNA_LABELS[k], pct: r.dna[k] * 10 }));
    const chips = [r.platoon, r.role, r.marital, r.kids !== undefined && r.kids !== null && `${r.kids} ילדים`]
      .filter(Boolean)
      .map((x) => `<span class="chip">${esc(x)}</span>`)
      .join('');
    const qText = (id) => (QUESTION_BANK.find((q) => q.id === id) || {}).text || '';
    return `
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${r.breakdown.length ? `<div class="sum-title">פירוט הסבל</div><div class="bars">${bars(r.breakdown)}</div>` : ''}
      ${dnaRows.length ? `<div class="sum-title">DNA פלוגתי</div><div class="q-hint">${esc(dnaHeadline(r.dna))}</div><div class="bars">${bars(dnaRows)}</div>` : ''}
      ${quotes.length ? `<div class="sum-title">מהשטח</div>${quotes.map(([id, t]) => `<div class="quote"><span>${esc(qText(id))}</span>${esc(t)}</div>`).join('')}` : ''}`;
  }

  function renderPlay() {
    const sections = buildSections();
    app.innerHTML = `
      <section class="hero" id="hero"></section>
      ${sections
        .map(
          (s, i) => `<section class="section">
            <div class="sec-num">משתנה ${String(i + 1).padStart(2, '0')}</div>
            <h2 class="sec-title">${esc(s.title)}</h2>
            ${s.sub ? `<div class="sec-sub">${esc(s.sub)}</div>` : ''}
            ${s.items.map(renderQuestion).join('')}
          </section>`
        )
        .join('')}
      <section class="section final">
        <div class="sec-num">סיכום</div>
        <h2 class="sec-title">כרטיס הסבל שלך</h2>
        <div id="summary"></div>
        <button class="pill dark wide" id="share-final">${ICON_SHARE}<span>שתף בקבוצת הפלוגה</span></button>
        <button class="pill wide" id="copy">העתק קישור</button>
        <p class="fine">משחק הומוריסטי בלבד. אל תכתבו מידע מבצעי, מיקומים או שעות של עמדות.</p>
      </section>`;

    for (const q of ALL) {
      const el = app.querySelector(`.q[data-id="${q.id}"]`);
      if (el) bindQuestion(el, q);
    }
    document.getElementById('share-final').onclick = share;
    document.getElementById('copy').onclick = copyLink;
    setupSticky();
    update();
  }

  function update() {
    const r = computeResult(answers);
    const hero = document.getElementById('hero');
    hero.innerHTML = heroHTML(r, 'play');
    document.getElementById('share-hero').onclick = share;
    document.getElementById('reset').onclick = reset;

    const tier = r.started ? tierFor(r) : null;
    document.getElementById('sticky-score').textContent = fmt(r.score);
    document.getElementById('sticky-label').textContent = tier ? tier.title : 'עוד לא התחלת לסבול';
    document.getElementById('sticky-line').style.width = `${clamp(((r.baseline ? r.score / r.baseline : 0) / 2.2) * 100, 0, 100)}%`;

    const p = sharePayload(r, answers);
    document.getElementById('summary').innerHTML = summaryHTML(r, p.t);
  }

  function shareUrl() {
    const r = computeResult(answers);
    return { r, url: `${location.origin}${location.pathname}${location.search}#r=${encode(sharePayload(r, answers))}` };
  }

  async function share() {
    const { r, url } = shareUrl();
    const tier = tierFor(r);
    const text = `מדד הסבל המילואימניקי שלי: ${fmt(r.score)} נקודות. "${tier.label}"\nכמה אתה סבלת?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'מדד הסבל המילואימניקי', text, url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank');
  }

  async function copyLink() {
    const { url } = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast('הקישור הועתק');
    } catch (e) {
      prompt('העתק את הקישור:', url);
    }
  }

  function reset() {
    if (Object.keys(answers).length && !confirm('למחוק את כל התשובות ולהתחיל מחדש?')) return;
    answers = {};
    renderPlay();
    window.scrollTo(0, 0);
  }

  function renderShared(r) {
    app.innerHTML = `
      <section class="hero" id="hero">${heroHTML(r, 'shared')}</section>
      <section class="section final"><div id="summary">${summaryHTML(r, r.quotes)}</div></section>`;
    document.getElementById('sticky').classList.remove('show');
    document.getElementById('play').onclick = () => {
      try {
        sessionStorage.setItem('friend', JSON.stringify({ name: r.name, score: r.score }));
      } catch (e) { /* בלי השוואה, לא נורא */ }
      history.replaceState(null, '', location.pathname + location.search);
      answers = {};
      renderPlay();
      window.scrollTo(0, 0);
    };
  }

  let observer;
  function setupSticky() {
    const sticky = document.getElementById('sticky');
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(([e]) => sticky.classList.toggle('show', !e.isIntersecting), {
      rootMargin: '-70px 0px 0px 0px',
    });
    observer.observe(document.getElementById('hero'));
    document.getElementById('sticky-share').onclick = share;
  }

  function route() {
    const m = location.hash.match(/^#r=([\w-]+)/);
    if (m) {
      try {
        shared = fromPayload(decode(m[1]));
        renderShared(shared);
        window.scrollTo(0, 0);
        return;
      } catch (e) { /* קישור פגום – מתחילים רגיל */ }
    }
    renderPlay();
  }
  window.addEventListener('hashchange', route);
  route();

  // לבדיקות
  window.__shabtzak = { computeResult, questionPoints, roleBaseline, get answers() { return answers; } };
})();
