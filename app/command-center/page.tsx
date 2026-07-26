import { AppShell } from "@/components/app-shell";
import { loadAppData } from "@/lib/view/app-data";
import { headers } from "next/headers";
import { RequestContextError, resolveRequestContext } from "@/lib/security/request-context";
import { AuthGate } from "@/components/auth-gate";

export const dynamic = "force-dynamic";

/**
 * The SiteVelocity application, relocated from `/` per Segment 8
 * (public landing page owns the root route; its primary CTA lands here).
 */
export default async function CommandCenter() {
  let context;
  try {
    context = await resolveRequestContext(await headers(), "read");
  } catch (error) {
    const status = error instanceof RequestContextError ? error.status : 503;
    return <AuthGate status={status} />;
  }
  const data = await loadAppData(context.organizationId, { userId: context.userId, role: context.role });
  return <AppShell data={data} />;
}
