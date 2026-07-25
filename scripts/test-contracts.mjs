// Contract-test runner: `npm run test:contracts [-- <name-filter>]`
// Runs every tests/contracts/*.test.ts, or only those whose filename contains
// the optional filter (e.g. `npm run test:contracts -- render-alpha-deployment`).

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "tests", "contracts");
const filter = process.argv[2];

let files;
try {
  files = readdirSync(dir).filter((file) => file.endsWith(".test.ts"));
} catch {
  console.log("test:contracts: no tests/contracts directory; nothing to run.");
  process.exit(0);
}

if (filter) {
  files = files.filter((file) => file.includes(filter));
  if (files.length === 0) {
    console.error(`test:contracts: no contract test matches "${filter}".`);
    process.exit(1);
  }
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...files.map((file) => path.join(dir, file))],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
