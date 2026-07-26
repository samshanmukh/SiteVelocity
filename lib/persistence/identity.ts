import { createHash } from "node:crypto";

/** Stable UUID-shaped identifier for repeatable imports of an external identity. */
export function deterministicUuid(namespace: string, value: string): string {
  const hex = createHash("sha256").update(`${namespace}\0${value}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
