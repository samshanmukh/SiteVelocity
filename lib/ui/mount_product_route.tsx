import { ProductRouteStub } from "./product_route_stub";
import {
  isGeneratedAlphaUiPresent,
  type ProductRoute,
} from "./load_generated_ui";

/**
 * Thin mount helper for committed product routes.
 * When generated UI exists, dynamic import is reserved for a follow-up wiring
 * step that supplies validated view models; until then routes stay stub-safe.
 */
export function MountProductRoute(props: {
  route: ProductRoute;
  title: string;
  siteId?: string;
}) {
  // Capability labels and journey data come only from validated view models
  // after generation + application-boundary wiring. Never invent them here.
  if (!isGeneratedAlphaUiPresent()) {
    return (
      <ProductRouteStub
        route={props.route}
        title={props.title}
        siteId={props.siteId}
      />
    );
  }

  return (
    <ProductRouteStub
      route={props.route}
      title={`${props.title} (generated module present — wire validated model)`}
      siteId={props.siteId}
    />
  );
}
