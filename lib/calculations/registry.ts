import { z } from "zod";

/**
 * Deterministic calculation registry (docs/SYSTEM_DESIGN.md §13).
 * Every decision-grade number in SiteVelocity is produced here — typed,
 * versioned, reproducible. An LLM may request or explain a calculation;
 * it is never the calculator of record.
 */

export interface Calculation<I, O> {
  type: string;
  version: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute(input: I): O;
}

export interface CalculationRun<O> {
  type: string;
  version: string;
  inputHash: string;
  warnings: string[];
  output: O;
  calculatedAt: string;
}

/** Stable stringify (sorted keys) so identical inputs hash identically. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const registry = new Map<string, Calculation<unknown, unknown>>();

export function registerCalculation<I, O>(calc: Calculation<I, O>): Calculation<I, O> {
  registry.set(`${calc.type}@${calc.version}`, calc as Calculation<unknown, unknown>);
  return calc;
}

export function runCalculation<I, O>(
  calc: Calculation<I, O>,
  rawInput: unknown,
  now: () => string = () => new Date().toISOString(),
): CalculationRun<O> {
  const input = calc.inputSchema.parse(rawInput);
  const output = calc.outputSchema.parse(calc.execute(input));
  const warnings = (output as { warnings?: string[] }).warnings ?? [];
  return {
    type: calc.type,
    version: calc.version,
    inputHash: fnv1aHash(stableStringify(input)),
    warnings,
    output,
    calculatedAt: now(),
  };
}

export function listCalculations(): string[] {
  return [...registry.keys()].sort();
}
