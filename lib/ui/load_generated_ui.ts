import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolves the generated Alpha application UI module when present.
 * Presentation is produced by PDD generation; committed routes stay thin.
 */
export function generatedAlphaUiPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "generated", "ui", "alpha_application_ui.tsx"),
    path.join(process.cwd(), "generated", "ui", "alpha_application_ui.ts"),
    path.join(process.cwd(), "generated", "ui", "alpha_application_ui.js"),
    path.join(process.cwd(), "generated", "alpha_application_ui.tsx"),
    path.join(process.cwd(), "generated", "alpha_application_ui.ts"),
    path.join(process.cwd(), "generated", "alpha_application_ui.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isGeneratedAlphaUiPresent(): boolean {
  return generatedAlphaUiPath() !== null;
}

export type ProductRoute =
  | "command-center"
  | "scout"
  | "map"
  | "site-dossier"
  | "agents"
  | "next-steps";
