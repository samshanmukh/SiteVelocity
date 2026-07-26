import type { ProviderDiagnostic } from "./types";

export function configuredProvider(
  id: ProviderDiagnostic["id"],
  name: string,
  configured: boolean,
  configuredMessage: string,
  missingMessage: string,
): ProviderDiagnostic {
  return configured
    ? { id, name, status: "configured", message: configuredMessage }
    : { id, name, status: "unconfigured", message: missingMessage };
}
