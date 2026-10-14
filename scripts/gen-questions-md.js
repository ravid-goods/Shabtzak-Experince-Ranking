// מייצר את QUESTIONS.md מתוך questions.js.  הרצה: node scripts/gen-questions-md.js
const fs = require('fs');
const path = require('path');
const { CATEGORIES, PROFILE_QUESTIONS, FIXED_SLIDERS, QUESTION_BANK } = require('../questions.js');

const TYPE = { single: 'בחירה', multi: 'בחירה מרובה', number: 'מספר', slider: 'סרגל 1–10', text: 'טקסט חופשי' };
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(rows, withEnabled) {
  const head = withEnabled
    ? '| פעיל | מזהה | שאלה | סוג | מבוסס שיבוץ | הומור | קבוצתי | סה"כ |\n|:-:|---|---|---|:-:|:-:|:-:|:-:|'
    : '| מזהה | שאלה | סוג | מבוסס שיבוץ | הומור | קבוצתי | סה"כ |\n|---|---|---|:-:|:-:|:-:|:-:|';
  const lines = rows.map((q) => {
    const r = q.rating;
    const cols = [
      `\`${q.id}\``,
      cell(q.text),
      TYPE[q.type],
      r.data,
      r.humor,
      r.group,
      `**${r.data + r.humor + r.group}**`,
    ];
    if (withEnabled) cols.unshift(q.enabled ? '✅' : '⬜');
    return `| ${cols.join(' | ')} |`;
  });
  return `${head}\n${lines.join('\n')}`;
}

let out = `# מאגר השאלות – מדד הסבל המילואימניקי

> הקובץ נוצר אוטומטית מ-\`questions.js\` (\`node scripts/gen-questions-md.js\`). כדי לשנות – ערכו את \`questions.js\`.

כל שאלה מדורגת 1–5 בשלושה קריטריונים:

- **מבוסס שיבוץ** – כמה התשובה נגזרת ממה שמופיע בטבלאות השבצ"ק (עמדה × שעה × שמות, טאב לכל יום).
- **הומור** – כמה השאלה מצחיקה.
- **קבוצתי** – כמה זו חוויה שכל הפלוגה חוותה ותזהה.

✅ = פעיל במשחק כרגע. ⬜ = במאגר, כבוי. כדי להפעיל/לכבות: לשנות \`enabled\` ב-\`questions.js\`.
לתצוגה של כל המאגר במשחק: \`?all=1\`. להרצת שאלות נבחרות: \`?q=id1,id2\`.

## שאלות פרופיל (תמיד מוצגות – מגדירות את תת-הקבוצה)

${table(PROFILE_QUESTIONS, false)}

## חמש השאלות הקבועות (מוצגות בכל ריצה, סרגל 1–10)

${table(FIXED_SLIDERS, false)}

## המאגר
`;

for (const [key, c] of Object.entries(CATEGORIES)) {
  const rows = QUESTION_BANK.filter((q) => q.category === key);
  if (!rows.length) continue;
  out += `\n### ${c.label}\n\n${table(rows, true)}\n`;
}

const sorted = [...QUESTION_BANK].sort(
  (a, b) => b.rating.data + b.rating.humor + b.rating.group - (a.rating.data + a.rating.humor + a.rating.group)
);
out += `\n## כל המאגר לפי ציון כולל\n\n${table(sorted, true)}\n`;

const enabled = QUESTION_BANK.filter((q) => q.enabled).length;
out += `\n---\n\nסה"כ במאגר: ${QUESTION_BANK.length} שאלות · פעילות: ${enabled} · ריצה מלאה = ${PROFILE_QUESTIONS.length} פרופיל + ${enabled} + ${FIXED_SLIDERS.length} קבועות = ${PROFILE_QUESTIONS.length + enabled + FIXED_SLIDERS.length} שאלות.\n`;

fs.writeFileSync(path.join(__dirname, '..', 'QUESTIONS.md'), out);
console.log(`QUESTIONS.md: ${QUESTION_BANK.length} questions, ${enabled} enabled`);
