import { NextResponse } from "next/server";
import { checkProviderConnections } from "@/lib/providers/registry";
import { isProviderReady } from "@/lib/providers/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await checkProviderConnections();
  const connected = providers.filter((provider) => provider.status === "connected").length;
  const configured = providers.filter((provider) => provider.status === "configured").length;
  const unconfigured = providers.filter((provider) => provider.status === "unconfigured").length;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        total: providers.length,
        connected,
        configured,
        unconfigured,
        healthy: providers.every((provider) => provider.status !== "error"),
        ready: providers.every(isProviderReady),
      },
      providers,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
