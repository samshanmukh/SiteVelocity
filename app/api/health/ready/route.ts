import {
  evaluateReadiness,
  parseDeploymentEnv,
  readinessHttpStatus,
} from "@/lib/config/deployment-env";
import { probeDependencies } from "@/lib/config/deployment-probes";

export const dynamic = "force-dynamic";

// Readiness for deploy verification and smoke checks (render-alpha-deployment R6, R7).
// 200 only when configuration and mode-required dependencies are ready; otherwise
// 503 with stable reason codes and variable names — never secret values or
// provider diagnostics (R9, R15).
export async function GET(): Promise<Response> {
  const parsed = parseDeploymentEnv(process.env);
  const probe = await probeDependencies(parsed);
  const result = evaluateReadiness(parsed, probe);

  return Response.json(result, {
    status: readinessHttpStatus(result),
    headers: { "Cache-Control": "no-store" },
  });
}
