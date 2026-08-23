const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "raw");

function load(name) {
  const text = fs.readFileSync(path.join(dir, name), "utf8");
  return text.split(/\r?\n/).filter(l => l.trim());
}

for (const f of ["cet4.txt", "cet6.txt", "kaoyan.txt"]) {
  const lines = load(f);
  const cols = lines.map(l => l.split("\t"));
  const words = cols.map(c => (c[0] || "").trim().toLowerCase());
  const uniq = new Set(words);
  let noPhon = 0, noSenses = 0, noSent = 0, noPhrase = 0;
  for (const c of cols) {
    if (!(c[2] || "").trim() && !(c[1] || "").trim()) noPhon++;
    if (!(c[3] || "").trim()) noSenses++;
    if (!(c[5] || "").trim()) noSent++;
    if (!(c[4] || "").trim()) noPhrase++;
  }
  console.log(`\n=== ${f} ===`);
  console.log("lines:", lines.length, "unique words:", uniq.size);
  console.log("no phonetic:", noPhon, "| no senses:", noSenses, "| no sentences:", noSent, "| no phrases:", noPhrase);
  console.log("sample cols[0]:", JSON.stringify(cols[0].map(s => s.slice(0, 30))));
  const hasTabInside = cols.filter(c => c.length !== 6).length;
  console.log("rows with != 6 columns:", hasTabInside);
  if (cols[0].length >= 6) {
    const s = cols[0][5].split("¦")[0];
    console.log("first sentence field:", JSON.stringify(s.slice(0, 90)));
  }
}

const c4 = new Set(load("cet4.txt").map(l => l.split("\t")[0].trim().toLowerCase()));
const c6 = new Set(load("cet6.txt").map(l => l.split("\t")[0].trim().toLowerCase()));
const ky = new Set(load("kaoyan.txt").map(l => l.split("\t")[0].trim().toLowerCase()));
console.log("\n=== coverage ===");
console.log("cet6 contains 'abandon':", c6.has("abandon"));
console.log("kaoyan contains 'abandon':", ky.has("abandon"));
console.log("cet6 only words:", [...c6].filter(w => !c4.has(w)).length);
console.log("kaoyan only words (not in c4):", [...ky].filter(w => !c4.has(w)).length);
console.log("kaoyan words also in c4:", [...ky].filter(w => c4.has(w)).length);
console.log("cet4 words also in c6:", [...c4].filter(w => c6.has(w)).length);
