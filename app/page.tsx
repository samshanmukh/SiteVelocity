import { AppShell } from "@/components/app-shell";
import { loadAppData } from "@/lib/view/app-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadAppData();
  return <AppShell data={data} />;
}
