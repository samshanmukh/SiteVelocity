import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Contract tests run before and after PDD generation. When the generated
 * module does not exist yet, tests skip instead of failing; once it exists,
 * genuine load errors (syntax, type) propagate.
 */
export function generatedModulePath(basename: string): string | null {
  for (const extension of [".ts", ".js"]) {
    const candidate = path.resolve(process.cwd(), "generated", `${basename}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function importGenerated(modulePath: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
}

export function skipReason(basename: string): string {
  return `generated/${basename}.ts not generated yet (run: pdd generate prompts/modules/${basename}_typescript.prompt)`;
}
