import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Contract tests run before and after PDD generation. When the generated
 * module does not exist yet, tests skip instead of failing; once it exists,
 * genuine load errors (syntax, type) propagate.
 *
 * Supports `.tsx` / `.ts` / `.js` under `generated/` and `generated/ui/`.
 */
export function generatedModulePath(basename: string): string | null {
  const roots = [
    path.resolve(process.cwd(), "generated", "ui"),
    path.resolve(process.cwd(), "generated"),
  ];
  const extensions = [".tsx", ".ts", ".js"];
  for (const root of roots) {
    for (const extension of extensions) {
      const candidate = path.join(root, `${basename}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export async function importGenerated(
  modulePath: string,
): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(modulePath).href)) as Record<
    string,
    unknown
  >;
}

export function skipReason(basename: string): string {
  return `generated/${basename}.tsx (or generated/ui/) not generated yet (run: pdd generate prompts/modules/${basename}_typescript.prompt)`;
}

export function renderEnvSkipReason(): string {
  return "render test env not configured (jsdom + @testing-library/react); structural coverage still runs";
}
