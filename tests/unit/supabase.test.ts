import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Supabase server provider diagnostics", () => {
  const casesPath = fileURLToPath(new URL("./supabase.cases.ts", import.meta.url));
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--test", casesPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
});
