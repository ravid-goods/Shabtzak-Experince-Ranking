/* מדד הסבל המילואימניקי – לוגיקת המשחק. בלי שרת, בלי build. */
(function () {
  'use strict';

  const SERVICE_DAYS = 80;

  const TIERS = [
    { max: 15, title: 'תייר במילואים', emoji: '🏖️', text: 'שמעו שהיית במילואים. השבצ"ק לא בטוח.' },
    { max: 30, title: 'פנסיונר פלוגתי', emoji: '☕', text: 'שתית יותר קפה ממה ששמרת. וזה בסדר. בערך.' },
    { max: 45, title: 'מילואימניק מצוי', emoji: '🪖', text: 'עשית את שלך, התלוננת במידה, אכלת שניצל.' },
    { max: 60, title: 'עמוד התווך של השבצ"ק', emoji: '🧱', text: 'כשמחפשים מישהו למשמרת, השם שלך עולה ראשון.' },
    { max: 75, title: 'קורבן מערכת', emoji: '😵‍💫', text: 'השבצ"ק מכיר אותך אישית. ולא לטובה.' },
    { max: 90, title: 'רוח הרפאים של התצפית', emoji: '👻', text: 'ראו אותך בעמדה. ראו אותך באוהל? לא בטוח.' },
    { max: 100, title: 'אגדה פלוגתית', emoji: '🏅', text: 'עוד יספרו עליך בפלוגה. בעיקר בצחוק, אבל בהערכה.' },
    { max: Infinity, title: 'שבר את הסקאלה', emoji: '🚨', text: 'המדד לא נבנה בשבילך. מישהו תביא לו יום חופש.' },
  ];

  const DNA_LABELS = { palmer: 'פלמר', tzabari: 'צברי', basos: 'בסוס', mahlaka1: 'מחלקה 1', poker: 'פוקר' };

  /* ───────── בחירת השאלות ───────── */
  function selectQuestions(params) {
    let bank = QUESTION_BANK.filter((q) => q.enabled);
    if (params.get('all') === '1') bank = QUESTION_BANK.slice();
    const only = params.get('q');
    if (only) {
      const ids = only.split(',').map((s) => s.trim());
      bank = ids.map((id) => QUESTION_BANK.find((q) => q.id === id)).filter(Boolean);
    }
    return [...PROFILE_QUESTIONS, ...bank, ...FIXED_SLIDERS];
  }

  /* ───────── חישוב ───────── */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function questionPain(q, answer) {
    if (answer === undefined || answer === null || answer === '') return null;
    switch (q.type) {
      case 'single':
        return clamp(q.options[answer].pain ?? 0, 0, 10);
      case 'multi': {
        if (!answer.length) return null;
        const sum = answer.reduce((s, i) => s + (q.options[i].pain ?? 0), q.baseline || 0);
        return clamp(sum, 0, 10);
      }
      case 'number': {
        const n = Number(answer);
        if (!Number.isFinite(n)) return null;
        let pain = q.scale[0][1];
        for (const [threshold, p] of q.scale) if (n >= threshold) pain = p;
        return clamp(pain, 0, 10);
      }
      case 'slider':
        return clamp((q.baseline || 0) + q.painPerPoint * Number(answer), 0, 10);
      default:
        return null;
    }
  }

  function computeResult(questions, answers) {
    const cats = {};
    for (const q of questions) {
      if (!q.category) continue;
      const pain = questionPain(q, answers[q.id]);
      if (pain === null) continue;
      const w = q.weight || 1;
      cats[q.category] = cats[q.category] || { sum: 0, max: 0 };
      cats[q.category].sum += pain * w;
      cats[q.category].max += 10 * w;
    }

    let weighted = 0;
    let weights = 0;
    const breakdown = [];
    for (const [key, c] of Object.entries(cats)) {
      const pct = c.sum / c.max;
      const cw = CATEGORIES[key].weight;
      weighted += pct * cw;
      weights += cw;
      breakdown.push({ key, label: CATEGORIES[key].label, pct: Math.round(pct * 100) });
    }
    const raw = weights ? (weighted / weights) * 100 : 0;

    const opt = (id) => {
      const q = PROFILE_QUESTIONS.find((p) => p.id === id);
      const a = answers[id];
      return a === undefined ? {} : q.options[a];
    };
    const role = opt('role');
    const marital = opt('marital');
    const kids = opt('kids');

    let sliderAdj = 0;
    const dna = {};
    for (const s of FIXED_SLIDERS) {
      const v = Number(answers[s.id] ?? 5);
      dna[s.id] = v;
      sliderAdj += (s.painPerPoint || 0) * v;
    }

    const score = Math.max(
      0,
      Math.round(raw * (role.mult ?? 1) * (marital.mult ?? 1) + (role.base ?? 0) + (kids.bonus ?? 0) + sliderAdj)
    );

    return {
      score,
      breakdown,
      dna,
      role: role.label,
      roleValue: role.value,
      platoon: opt('platoon').label,
      marital: marital.label,
      kids: kids.label,
    };
  }

  function tierFor(result) {
    if (result.roleValue === 'mordechai') {
      return { title: 'מרדכי', emoji: '🩺📟', text: 'חמ"ל וחובש בו זמנית. אין מה להוסיף. כל הפלוגה חייבת לך.' };
    }
    return TIERS.find((t) => result.score <= t.max);
  }

  function dnaHeadline(dna) {
    const keys = ['palmer', 'tzabari', 'basos', 'mahlaka1'];
    const top = keys.reduce((a, b) => (dna[b] > dna[a] ? b : a));
    if (dna[top] <= 3) return 'אתה לא פלמר, לא צברי, לא בסוס ולא מחלקה 1. מי אתה בכלל?';
    if (keys.every((k) => dna[k] >= 8)) return 'אתה כולם. אתה הפלוגה.';
    return `בעיקר: ${DNA_LABELS[top]} (${dna[top]}/10)`;
  }

  /* ───────── שיתוף ───────── */
  const encode = (obj) =>
    btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const decode = (str) => JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));

  function shareable(result, answers, questions) {
    const quotes = questions
      .filter((q) => q.type === 'text' && q.id !== 'name' && answers[q.id])
      .map((q) => [q.id, String(answers[q.id]).slice(0, 140)]);
    return {
      n: (answers.name || '').slice(0, 40),
      s: result.score,
      r: result.role,
      rv: result.roleValue,
      p: result.platoon,
      m: result.marital,
      k: result.kids,
      b: result.breakdown.map((x) => [x.key, x.pct]),
      d: result.dna,
      t: quotes,
    };
  }

  function fromShareable(o) {
    return {
      name: o.n,
      score: o.s,
      role: o.r,
      roleValue: o.rv,
      platoon: o.p,
      marital: o.m,
      kids: o.k,
      breakdown: (o.b || []).filter(([k]) => CATEGORIES[k]).map(([key, pct]) => ({ key, label: CATEGORIES[key].label, pct })),
      dna: o.d || {},
      quotes: o.t || [],
    };
  }

  /* ───────── UI ───────── */
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const questions = selectQuestions(params);
  let answers = {};
  let index = 0;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function friendResult() {
    try {
      const raw = sessionStorage.getItem('friend');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function renderIntro(friend) {
    const friendLine = friend
      ? `<p class="compare">${esc(friend.name || 'חבר מהפלוגה')} קיבל <b>${friend.score}</b>. בוא נראה אם סבלת יותר.</p>`
      : '';
    app.innerHTML = `
      <div class="card">
        <div class="emoji-hero">🪖</div>
        <h1>מדד הסבל המילואימניקי</h1>
        <p>${SERVICE_DAYS} יום. פלוגה אחת. שבצ"ק אחד. אותה חוויה בדיוק — ובכל זאת מישהו סבל יותר.</p>
        <p class="muted">עונים על ${questions.length} שאלות קצרות על משמרות, לילות, יציאות הביתה וגורל באופן כללי, ומקבלים ציון סבל מ-0 עד 100 (בערך).</p>
        ${friendLine}
        <div class="btn-row"><button class="btn" id="start">יאללה, מתחילים</button></div>
        <p class="muted small" style="margin-top:14px">הומור בלבד. אל תכתבו מידע מבצעי, מיקומים או שעות אמיתיות של עמדות.</p>
      </div>`;
    document.getElementById('start').onclick = () => {
      index = 0;
      renderQuestion();
    };
  }

  function isAnswered(q) {
    const a = answers[q.id];
    if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
    if (q.type === 'slider') return true;
    return a !== undefined && a !== '';
  }

  function canSkip(q) {
    return q.type === 'text' || q.optional;
  }

  function renderQuestion() {
    const q = questions[index];
    const total = questions.length;
    if (q.type === 'slider' && answers[q.id] === undefined) answers[q.id] = 5;

    const cat = q.category ? CATEGORIES[q.category].label : FIXED_SLIDERS.includes(q) ? 'DNA פלוגתי' : 'פרופיל';
    let body = '';

    if (q.type === 'single' || q.type === 'multi') {
      const sel = answers[q.id];
      body = `<div class="options">${q.options
        .map((o, i) => {
          const on = q.type === 'multi' ? (sel || []).includes(i) : sel === i;
          return `<button class="option ${q.type === 'multi' ? 'multi' : ''} ${on ? 'selected' : ''}" data-i="${i}" role="${q.type === 'multi' ? 'checkbox' : 'radio'}" aria-checked="${on}"><span class="mark"></span><span>${esc(o.label)}</span></button>`;
        })
        .join('')}</div><div id="modal-slot"></div>`;
    } else if (q.type === 'number') {
      body = `<input class="text-input" id="inp" type="number" inputmode="numeric" min="0" placeholder="${esc(q.placeholder || 'מספר')}" value="${esc(answers[q.id] ?? '')}" />`;
    } else if (q.type === 'text') {
      body = `<textarea class="text-input" id="inp" maxlength="140" placeholder="${esc(q.placeholder || '')}">${esc(answers[q.id] ?? '')}</textarea>`;
    } else if (q.type === 'slider') {
      body = `
        <div class="slider-wrap">
          <div class="slider-value" id="sv">${answers[q.id]}</div>
          <input type="range" id="inp" min="1" max="10" step="1" value="${answers[q.id]}" aria-label="${esc(q.text)}" />
          <div class="slider-labels"><span>1 · ${esc(q.minLabel || '')}</span><span>${esc(q.maxLabel || '')} · 10</span></div>
        </div>`;
    }

    const nextLabel = index === total - 1 ? 'לתוצאה 🎖️' : 'הבא';
    app.innerHTML = `
      <div class="progress"><div style="width:${(index / total) * 100}%"></div></div>
      <div class="progress-label"><span>שאלה ${index + 1} מתוך ${total}</span><span>${Math.round((index / total) * 100)}%</span></div>
      <div class="card">
        <span class="cat-chip">${esc(cat)}</span>
        <h2>${esc(q.text)}</h2>
        ${body}
        <div class="btn-row">
          ${index > 0 ? '<button class="btn secondary" id="back">חזרה</button>' : ''}
          <button class="btn" id="next" ${isAnswered(q) || canSkip(q) ? '' : 'disabled'}>${isAnswered(q) || !canSkip(q) ? nextLabel : 'דלג'}</button>
        </div>
      </div>`;

    const nextBtn = document.getElementById('next');
    const refreshNext = () => {
      nextBtn.disabled = !(isAnswered(q) || canSkip(q));
      nextBtn.textContent = isAnswered(q) || !canSkip(q) ? nextLabel : 'דלג';
    };

    if (q.type === 'single' || q.type === 'multi') {
      app.querySelectorAll('.option').forEach((btn) => {
        btn.onclick = () => {
          const i = Number(btn.dataset.i);
          if (q.type === 'single') {
            if (q.options[i].mordechaiOnly) return askMordechai(i);
            answers[q.id] = i;
            renderQuestion();
            setTimeout(goNext, 180);
          } else {
            const cur = new Set(answers[q.id] || []);
            cur.has(i) ? cur.delete(i) : cur.add(i);
            answers[q.id] = [...cur].sort((a, b) => a - b);
            renderQuestion();
          }
        };
      });
    } else {
      const inp = document.getElementById('inp');
      inp.oninput = () => {
        answers[q.id] = q.type === 'slider' ? Number(inp.value) : inp.value.trim();
        if (q.type === 'slider') document.getElementById('sv').textContent = inp.value;
        refreshNext();
      };
      inp.onkeydown = (e) => {
        if (e.key === 'Enter' && q.type !== 'text' && !nextBtn.disabled) goNext();
      };
      if (q.type !== 'slider') inp.focus();
    }

    nextBtn.onclick = goNext;
    const back = document.getElementById('back');
    if (back) back.onclick = () => { index--; renderQuestion(); };
  }

  function askMordechai(i) {
    const q = questions[index];
    document.getElementById('modal-slot').innerHTML = `
      <div class="modal">
        <b>רגע רגע. אתה מרדכי?</b>
        <div class="btn-row">
          <button class="btn accent" id="yes-m">כן, אני מרדכי</button>
          <button class="btn secondary" id="no-m">לא...</button>
        </div>
      </div>`;
    document.getElementById('yes-m').onclick = () => {
      answers[q.id] = i;
      if (!answers.name) answers.name = 'מרדכי';
      goNext();
    };
    document.getElementById('no-m').onclick = () => {
      document.getElementById('modal-slot').innerHTML =
        '<div class="modal">התפקיד הזה שמור למרדכי בלבד. יש רק מרדכי אחד. בחר תפקיד אחר 🙃</div>';
    };
  }

  function goNext() {
    if (index < questions.length - 1) {
      index++;
      renderQuestion();
      window.scrollTo(0, 0);
    } else {
      finish();
    }
  }

  function finish() {
    const result = computeResult(questions, answers);
    const payload = shareable(result, answers, questions);
    const url = `${location.origin}${location.pathname}#r=${encode(payload)}`;
    renderResult(fromShareable(payload), url, true);
  }

  function renderResult(r, url, mine) {
    const tier = tierFor(r);
    const pct = Math.min(r.score, 100);
    const friend = mine ? friendResult() : null;
    const quoteText = (id) => (QUESTION_BANK.find((q) => q.id === id) || {}).text || '';

    const profileChips = [r.platoon, r.role, r.marital, r.kids && `ילדים: ${r.kids}`]
      .filter(Boolean)
      .map((x) => `<span class="cat-chip">${esc(x)}</span>`)
      .join('');

    const bars = (rows) =>
      rows
        .map(
          (b) => `<div class="bar-row"><span>${esc(b.label)}</span><div class="track"><div class="fill" style="width:${b.pct}%"></div></div><span class="val">${b.pct}</span></div>`
        )
        .join('');

    const dnaRows = Object.keys(DNA_LABELS)
      .filter((k) => r.dna[k] !== undefined)
      .map((k) => ({ label: DNA_LABELS[k], pct: r.dna[k] * 10 }));

    let compare = '';
    if (friend) {
      const diff = r.score - friend.score;
      const who = esc(friend.name || 'החבר שלך');
      compare = `<div class="compare">${
        diff === 0
          ? `תיקו מושלם עם ${who}. אתם כנראה עשיתם את אותן משמרות.`
          : diff > 0
          ? `סבלת <b>${diff}</b> נקודות יותר מ${who}. תדרוש פיצוי.`
          : `${who} סבל <b>${-diff}</b> נקודות יותר ממך. תביא לו שוקולד.`
      }</div>`;
    }

    app.innerHTML = `
      <div class="card">
        <div class="score-hero">
          <div class="muted small">${mine ? 'מדד הסבל שלך' : `מדד הסבל של ${esc(r.name || 'חבר מהפלוגה')}`}</div>
          <div class="emoji-hero" style="margin:8px 0 4px">${tier.emoji}</div>
          <div class="score-number">${r.score}<small>/100</small></div>
          <div class="score-title">${esc(tier.title)}</div>
          <div class="muted">${esc(tier.text)}</div>
          <div class="meter"><div style="width:${pct}%"></div></div>
          <div class="profile-line">${profileChips}</div>
        </div>
        ${compare}
        ${r.breakdown.length ? `<div class="section-title">פירוט הסבל</div><div class="bars">${bars(r.breakdown)}</div>` : ''}
        ${dnaRows.length ? `<div class="section-title">DNA פלוגתי</div><p class="muted small">${esc(dnaHeadline(r.dna))}</p><div class="bars">${bars(dnaRows)}</div>` : ''}
        ${
          r.quotes.length
            ? `<div class="section-title">מהשטח</div>${r.quotes
                .map(([id, t]) => `<div class="quote"><span class="q">${esc(quoteText(id))}</span>${esc(t)}</div>`)
                .join('')}`
            : ''
        }
        <div class="btn-row">
          ${mine ? '<button class="btn accent" id="share">שתף בקבוצת הפלוגה</button>' : '<button class="btn accent" id="play">גם אני רוצה לדעת כמה סבלתי</button>'}
        </div>
        ${mine ? '<div class="btn-row" style="margin-top:10px"><button class="btn secondary" id="copy">העתק קישור</button><button class="btn secondary" id="again">שוב מההתחלה</button></div>' : ''}
      </div>`;

    if (mine) {
      const text = `מדד הסבל המילואימניקי שלי: ${r.score}/100 — "${tier.title}" ${tier.emoji}\nכמה אתה סבלת?`;
      document.getElementById('share').onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: 'מדד הסבל המילואימניקי', text, url });
            return;
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank');
      };
      document.getElementById('copy').onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast('הקישור הועתק');
        } catch (e) {
          prompt('העתק את הקישור:', url);
        }
      };
      document.getElementById('again').onclick = restart;
    } else {
      document.getElementById('play').onclick = () => {
        try {
          sessionStorage.setItem('friend', JSON.stringify({ name: r.name, score: r.score }));
        } catch (e) { /* בלי השוואה, לא נורא */ }
        history.replaceState(null, '', location.pathname + location.search);
        answers = {};
        renderIntro(friendResult());
      };
    }
    window.scrollTo(0, 0);
  }

  function restart(e) {
    if (e) e.preventDefault();
    answers = {};
    index = 0;
    history.replaceState(null, '', location.pathname + location.search);
    renderIntro(friendResult());
  }

  document.getElementById('restart-link').onclick = restart;

  /* ───────── עלייה ───────── */
  function route() {
    const m = location.hash.match(/^#r=([\w-]+)/);
    if (m) {
      try {
        renderResult(fromShareable(decode(m[1])), location.href, false);
        return;
      } catch (e) { /* קישור פגום – מתחילים רגיל */ }
    }
    renderIntro(friendResult());
  }
  window.addEventListener('hashchange', route);
  route();

  // לבדיקות
  window.__shabtzak = { computeResult, questionPain, selectQuestions };
})();
