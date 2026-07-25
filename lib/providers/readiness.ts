import type { ProviderDiagnostic } from "./types";

export function isProviderReady(provider: Pick<ProviderDiagnostic, "status">): boolean {
  return provider.status === "connected" || provider.status === "configured";
}
