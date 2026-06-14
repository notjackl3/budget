// Generate deterministic text fixtures from the real PDFs so the parser tests
// don't need to run pdf-parse. Run: npx tsx scripts/make-fixtures.ts
import fs from "node:fs";
import path from "node:path";
import pdf from "pdf-parse/lib/pdf-parse.js";

const STATEMENTS = path.join(process.cwd(), "statements");
const OUT = path.join(process.cwd(), "tests", "fixtures");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs
    .readdirSync(STATEMENTS)
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  for (const f of files) {
    const buf = fs.readFileSync(path.join(STATEMENTS, f));
    const data = await pdf(buf);
    const outName = f.replace(/\.pdf$/, ".txt");
    fs.writeFileSync(path.join(OUT, outName), data.text, "utf8");
    console.log(`wrote ${outName} (${data.text.length} chars)`);
  }
}

main();
