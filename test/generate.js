const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const RAW = path.join(__dirname, "raw");

/* ---------- 解析源 TSV ---------- */
function parseTSV(name) {
  const lines = fs.readFileSync(path.join(RAW, name), "utf8").split(/\r?\n/).filter(l => l.trim());
  const rows = [];
  for (const line of lines) {
    const c = line.split("\t");
    const word = (c[0] || "").trim().toLowerCase();
    if (!word) continue;
    let ph = (c[2] || c[1] || "").trim().replace(/'/g, "\u02C8");
    if (ph) ph = "/" + ph + "/";
    const senses = (c[3] || "").split("\u00A6").map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf("::");
      if (i === -1) return { pos: "", cn: cleanSense(s) };
      return { pos: s.slice(0, i).trim(), cn: cleanSense(s.slice(i + 2)) };
    }).filter(s => s.cn);
    const phrases = (c[4] || "").split("\u00A6").map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf("::");
      if (i === -1) return null;
      return { en: s.slice(0, i).trim(), cn: s.slice(i + 2).trim() };
    }).filter(p => p && p.en && p.cn && p.en.length <= 40);
    const sentences = (c[5] || "").split("\u00A6").map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf("::");
      if (i === -1) return null;
      return { en: s.slice(0, i).trim(), cn: s.slice(i + 2).trim() };
    }).filter(s => s && s.en && s.cn);
    rows.push({ word, phonetic: ph, senses, phrases, sentences });
  }
  return rows;
}

function cleanSense(t) {
  return t.replace(/[~|]/g, "\u4E28").replace(/\s{2,}/g, " ").trim();
}

/* ---------- 例句挑选 ---------- */
function pickSentence(list) {
  if (!list || !list.length) return null;
  const full = s => /^[A-Z]/.test(s.en) && !/^[.\u2026]/.test(s.en) && !s.en.includes("(") && s.en.length >= 10 && s.en.length <= 160;
  const ok = s => !/^[.\u2026]/.test(s.en) && !s.en.includes("(=") && !s.en.includes("(") && s.en.length >= 10 && s.en.length <= 160;
  const chosen = list.find(full) || list.find(ok) || list.find(s => !/^[.\u2026]/.test(s.en) && !s.en.includes("(=")) || list[0];
  const en = chosen.en.replace(/\s*\([^)]*=[^)]*\)/g, "").replace(/\s{2,}/g, " ").replace(/~/g, "-").trim();
  const cn = chosen.cn.replace(/~/g, "-").trim();
  if (!en || !cn) return null;
  return { en, cn };
}

/* ---------- 同词多行合并 ---------- */
function mergeRows(rows) {
  const map = new Map();
  for (const r of rows) {
    const e = map.get(r.word);
    if (!e) {
      map.set(r.word, { word: r.word, phonetic: r.phonetic, senses: r.senses.slice(), phrases: r.phrases.slice(), sentences: r.sentences.slice() });
    } else {
      for (const s of r.senses) {
        if (!e.senses.some(x => x.pos === s.pos && x.cn === s.cn)) e.senses.push(s);
      }
      for (const p of r.phrases) {
        if (!e.phrases.some(x => x.en === p.en)) e.phrases.push(p);
      }
      if (e.sentences.length < 3) e.sentences.push(...r.sentences);
    }
  }
  return [...map.values()];
}

/* ---------- 输出行 ---------- */
function mergeSenses(senses) {
  const byPos = new Map();
  for (const s of senses) {
    const key = s.pos || "";
    const arr = byPos.get(key) || [];
    if (arr.some(x => x.includes(s.cn))) continue;
    for (let i = arr.length - 1; i >= 0; i--) if (s.cn.includes(arr[i])) arr.splice(i, 1);
    arr.push(s.cn);
    byPos.set(key, arr);
  }
  return [...byPos.entries()].slice(0, 5).map(([pos, cns]) =>
    (pos ? pos + ". " : "") + cns.slice(0, 2).map(c => c.replace(/;/g, "\uFF1B")).join("\uFF1B")
  );
}

function toLine(w) {
  const senses = mergeSenses(w.senses).join("||");
  const sent = pickSentence(w.sentences);
  const collocs = w.phrases.slice(0, 3).map(p =>
    p.en.replace(/[;=\uff1d~]/g, " ").trim() + "=" + p.cn.replace(/[;=\uff1d~]/g, "\uFF0C").trim()
  ).join("; ");
  return [w.word, w.phonetic, senses, sent ? sent.en : "", sent ? sent.cn : "", collocs].join("~");
}

function poolToBlock(rows) {
  return rows.map(toLine).filter(l => !l.includes("`") && !l.includes("${")).join("\n");
}

/* ---------- 主流程 ---------- */
const cet4Rows = mergeRows(parseTSV("cet4.txt"));
const cet6Rows = mergeRows(parseTSV("cet6.txt"));
const kyRows = mergeRows(parseTSV("kaoyan.txt"));

const c4set = new Set(cet4Rows.map(w => w.word));
const c6set = new Set(cet6Rows.map(w => w.word));
const cet6Only = cet6Rows.filter(w => !c4set.has(w.word));
const kySolo = kyRows.filter(w => !c4set.has(w.word) && !c6set.has(w.word));
const kyNames = kyRows.map(w => w.word);

console.log("CET4 unique:", cet4Rows.length);
console.log("CET6 unique:", cet6Rows.length, "| CET6-only:", cet6Only.length);
console.log("KY unique:", kyRows.length, "| KY-solo:", kySolo.length);

const blockC4 = poolToBlock(cet4Rows);
const blockC6 = poolToBlock(cet6Only);
const blockKY = poolToBlock(kySolo);
const namesKY = kyNames.join("|");
console.log("block sizes KB:", Math.round(blockC4.length / 1024), Math.round(blockC6.length / 1024), Math.round(blockKY.length / 1024), Math.round(namesKY.length / 1024));

const newBlock = `/* ================= \u5185\u7F6E\u8BCD\u4E66\uFF08\u56DB\u7EA7 / \u516D\u7EA7 / \u8003\u7814\uFF0C\u6570\u636E\u6E90 KyleBing/english-vocabulary\uFF09 =================
   \u884C\u683C\u5F0F\uFF1A\u5355\u8BCD~\u97F3\u6807~\u91CA\u4E49(\u591A\u4E49\u9879\u7528||\u5206\u9694)~\u4F8B\u53E5~\u4F8B\u53E5\u7FFB\u8BD1~\u53E5\u5F0F\u642D\u914D(en=cn;\u5206\u53F7\u5206\u9694) */
function parseBuiltinBook(text) {
  return text.trim().split("\\n").map(l => l.trim()).filter(Boolean).map(line => {
    const f = line.split("~");
    return {
      word: (f[0] || "").trim().toLowerCase(),
      phonetic: (f[1] || "").trim(),
      senses: parseSenses((f[2] || "").trim(), "", ""),
      example: (f[3] || "").trim(),
      exampleCn: (f[4] || "").trim(),
      collocs: parseCollocs(f[5] || "")
    };
  }).filter(w => w.word && w.senses.length);
}

const CET4_POOL = parseBuiltinBook(\`
${blockC4}
\`);

const CET6_ONLY = parseBuiltinBook(\`
${blockC6}
\`);

const KY_SOLO = parseBuiltinBook(\`
${blockKY}
\`);

const KY_NAMES = "${namesKY}".split("|");
const BOOK_DICT = new Map();
for (const w of CET4_POOL) BOOK_DICT.set(w.word, w);
for (const w of CET6_ONLY) BOOK_DICT.set(w.word, w);
for (const w of KY_SOLO) BOOK_DICT.set(w.word, w);

const CET6_FULL = CET6_ONLY.concat(CET4_POOL);
const KY_FULL = KY_NAMES.map(n => BOOK_DICT.get(n)).filter(Boolean);

function sampleBook(arr, n) {
  if (arr.length <= n) return arr.slice();
  const stride = arr.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * stride)]);
  return out;
}

const BOOK_VER = 4;
const BUILTIN_BOOKS = [
  { id: "cet4-core",      name: "\u56DB\u7EA7\u6838\u5FC3\u8BCD\u6C47",       words: sampleBook(CET4_POOL, 1000) },
  { id: "cet4-emergency", name: "\u56DB\u7EA7\u9AD8\u9891\u5E94\u6025\u8BCD\u6C47",   words: sampleBook(CET4_POOL, 400) },
  { id: "cet4-flash",     name: "\u56DB\u7EA7\u8BCD\u6C47\u95EA\u8FC7",       words: sampleBook(CET4_POOL, 2000) },
  { id: "cet4-syllabus",  name: "\u56DB\u7EA7\u8003\u7EB2\u8BCD\u6C47",       words: CET4_POOL },
  { id: "cet6-core",      name: "\u516D\u7EA7\u6838\u5FC3\u8BCD\u6C47",       words: sampleBook(CET6_ONLY, 1000) },
  { id: "cet6-emergency", name: "\u516D\u7EA7\u9AD8\u9891\u5E94\u6025\u8BCD\u6C47",   words: sampleBook(CET6_ONLY, 400) },
  { id: "cet6-flash",     name: "\u516D\u7EA7\u8BCD\u6C47\u95EA\u8FC7",       words: sampleBook(CET6_FULL, 2000) },
  { id: "cet6-syllabus",  name: "\u516D\u7EA7\u8003\u7EB2\u8BCD\u6C47",       words: CET6_FULL },
  { id: "kaoyan-core",    name: "\u8003\u7814\u8003\u7EB2\u8BCD\u6C47\u6838\u5FC3\u7248", words: KY_FULL },
  { id: "demo-cet",       name: "\u56DB\u516D\u7EA7\u9AD8\u9891\u6F14\u793A\u8BCD\u4E66", words: DEMO_WORDS }
].map(d => Object.assign({}, d, { builtIn: true, ver: BOOK_VER, createdAt: 0 }));`;

/* ---------- 替换 index.html 旧数据块 ---------- */
let html = fs.readFileSync(HTML, "utf8");
const startMarker = "/* ================= \u5185\u7F6E\u8BCD\u4E66";
const endMarker = "createdAt: 0 }));";
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker, start);
if (start === -1 || end === -1) { console.error("MARKER NOT FOUND", start, end); process.exit(1); }
html = html.slice(0, start) + newBlock + html.slice(end + endMarker.length);
fs.writeFileSync(HTML, html, "utf8");
console.log("index.html size KB:", Math.round(html.length / 1024));

/* ---------- 校验 ---------- */
const m = html.match(/<script>([\s\S]*?)<\/script>/);
try { new Function(m[1]); console.log("SYNTAX OK"); }
catch (e) { console.log("SYNTAX ERROR:", e.message); process.exit(1); }

const counts = [...m[1].matchAll(/^(\S+?)~\/.+~/gm)].length;
console.log("data lines embedded:", counts);
