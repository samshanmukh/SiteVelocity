import { MountProductRoute } from "@/lib/ui/mount_product_route";

export default async function SiteDossierPage(props: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await props.params;
  return (
    <MountProductRoute
      route="site-dossier"
      title="Site Dossier"
      siteId={siteId}
    />
  );
}
