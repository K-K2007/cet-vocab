const fs = require("fs");
const html = fs.readFileSync("e:/work/cet-vocab/index.html", "utf8");

function extractPool(name) {
  const re = new RegExp("const " + name + " = parseBuiltinBook\\(`([\\s\\S]*?)`\\);");
  const m = html.match(re);
  return m ? m[1].trim().split("\n") : [];
}

for (const pool of ["CET4_POOL", "CET6_ONLY", "KY_SOLO"]) {
  const lines = extractPool(pool);
  const noEx = lines.filter(l => (l.split("~")[3] || "") === "").length;
  const noPh = lines.filter(l => (l.split("~")[1] || "") === "").length;
  const multi = lines.filter(l => (l.split("~")[2] || "").includes("||")).length;
  const hasCol = lines.filter(l => (l.split("~")[5] || "").trim() !== "").length;
  console.log(`${pool}: ${lines.length} words | no-example ${noEx} | no-phonetic ${noPh} | multi-sense ${multi} | has-collocs ${hasCol}`);
}

const c4 = extractPool("CET4_POOL");
console.log("\n--- samples ---");
for (const i of [0, 500, 2300, 4540]) {
  console.log("[" + i + "]", c4[i]);
}

// 模拟 parseBuiltinBook + parseSenses 验证可解析性
function POS_MARK(src) { return src; }
const sample = c4[500].split("~");
console.log("\nsense parse check:", JSON.stringify(sample[2]));
console.log("colloc parse check:", JSON.stringify(sample[5]));
