import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "docs", "PDD_USER_STORIES.md");
const promptDir = path.join(root, "prompts", "modules");
const strict = process.argv.includes("--strict");

const fail = (message) => {
  console.error(`pdd:stories: ${message}`);
  process.exitCode = 1;
};

if (!existsSync(catalogPath)) {
  fail("docs/PDD_USER_STORIES.md is missing");
  process.exit();
}

const catalog = readFileSync(catalogPath, "utf8");
const rows = catalog
  .split(/\r?\n/)
  .filter((line) => /^\|\s*US-PDD-\d{3}\s*\|/.test(line))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

const prompts = readdirSync(promptDir)
  .filter((name) => name.endsWith("_typescript.prompt"))
  .map((name) => `prompts/modules/${name}`)
  .sort();

const stripCode = (value) => value.replace(/^`|`$/g, "");
const seenIds = new Set();
const seenPrompts = new Set();
let authored = 0;
let planned = 0;

for (const cells of rows) {
  if (cells.length !== 7) {
    fail(`expected 7 columns, found ${cells.length}: ${cells.join(" | ")}`);
    continue;
  }

  const [id, , promptCell, testCell, story, coverage, state] = cells;
  const promptPath = stripCode(promptCell);
  const testPath = stripCode(testCell);

  if (seenIds.has(id)) fail(`duplicate story id ${id}`);
  if (seenPrompts.has(promptPath)) fail(`duplicate prompt mapping ${promptPath}`);
  seenIds.add(id);
  seenPrompts.add(promptPath);

  if (!/^As an? .+, I want .+, so that .+\.$/.test(story)) {
    fail(`${id} is not in "As a..., I want..., so that..." form`);
  }

  const absolutePrompt = path.join(root, promptPath);
  if (!existsSync(absolutePrompt)) {
    fail(`${id} references missing prompt ${promptPath}`);
    continue;
  }

  const prompt = readFileSync(absolutePrompt, "utf8");
  const ruleNumbers = [...prompt.matchAll(/^R(\d+) \((?:MUST|MUST NOT)\):/gm)]
    .map((match) => Number(match[1]));
  const uniqueRules = [...new Set(ruleNumbers)].sort((a, b) => a - b);
  const expectedRules = Array.from({ length: uniqueRules.at(-1) ?? 0 }, (_, index) => index + 1);

  if (JSON.stringify(uniqueRules) !== JSON.stringify(expectedRules)) {
    fail(`${promptPath} rules must be contiguous from R1`);
  }

  const range = coverage.match(/^R1[\u2013-]R(\d+)$/);
  if (!range || Number(range[1]) !== uniqueRules.at(-1)) {
    fail(`${id} declares ${coverage}; ${promptPath} contains R1–R${uniqueRules.at(-1) ?? 0}`);
  }

  const absoluteTest = path.join(root, testPath);
  if (state === "authored") {
    authored += 1;
    if (!existsSync(absoluteTest)) {
      fail(`${id} marks missing test ${testPath} as authored`);
      continue;
    }
    const test = readFileSync(absoluteTest, "utf8");
    for (const number of uniqueRules) {
      if (!new RegExp(`\\bR${number}\\b`).test(test)) {
        fail(`${id} rule R${number} is not named in ${testPath}`);
      }
    }
  } else if (state === "planned") {
    planned += 1;
    if (existsSync(absoluteTest)) {
      fail(`${id} test ${testPath} now exists; change its state to authored`);
    }
  } else {
    fail(`${id} has unsupported test state ${state}`);
  }
}

for (const prompt of prompts) {
  if (!seenPrompts.has(prompt)) fail(`missing user story for ${prompt}`);
}
for (const prompt of seenPrompts) {
  if (!prompts.includes(prompt)) fail(`catalog includes non-generation prompt ${prompt}`);
}

if (rows.length !== prompts.length) {
  fail(`expected ${prompts.length} stories, found ${rows.length}`);
}
if (strict && planned > 0) {
  fail(`strict mode rejects ${planned} planned contract test suite(s)`);
}

if (!process.exitCode) {
  console.log(`pdd:stories: ok (${rows.length} stories; ${authored} test-authored, ${planned} test-planned)`);
}

