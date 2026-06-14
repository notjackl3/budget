// Dev helper: dump the raw extracted text of a statement PDF so we can design
// and debug the parser. Usage: npx tsx scripts/extract-text.ts <path.pdf>
import fs from "node:fs";
import path from "node:path";
// Import the implementation directly to avoid pdf-parse's index.js debug shim
// (which tries to read a bundled test file at import time).
import pdf from "pdf-parse/lib/pdf-parse.js";

async function main() {
  const file =
    process.argv[2] ??
    path.join(process.cwd(), "statements", "onlineStatement_2025-02-26.pdf");
  const buf = fs.readFileSync(file);
  const data = await pdf(buf);
  console.log("=== NUM PAGES:", data.numpages, "===");
  console.log(data.text);
}

main();
