import { AppShell } from "@/components/app-shell";
import { loadAppData } from "@/lib/view/app-data";

export const dynamic = "force-dynamic";

/**
 * The SiteVelocity application, relocated from `/` per Segment 8
 * (public landing page owns the root route; its primary CTA lands here).
 */
export default async function CommandCenter() {
  const data = await loadAppData();
  return <AppShell data={data} />;
}
