import Link from "next/link";
import type { ProductRoute } from "./load_generated_ui";

const NAV: Array<{ href: string; route: ProductRoute; label: string }> = [
  { href: "/command-center", route: "command-center", label: "Command Center" },
  { href: "/scout", route: "scout", label: "Scout" },
  { href: "/map", route: "map", label: "Map" },
  { href: "/sites/example", route: "site-dossier", label: "Site Dossier" },
  { href: "/agents", route: "agents", label: "Agents" },
  { href: "/next-steps", route: "next-steps", label: "Next Steps" },
];

/**
 * Safe placeholder when generated presentation is not yet present.
 * Does not hard-code LIVE/PREVIEW/ROADMAP or invent product data.
 */
export function ProductRouteStub(props: {
  route: ProductRoute;
  title: string;
  siteId?: string;
}) {
  return (
    <main data-testid="product-route-stub" data-route={props.route}>
      <header>
        <p>SiteVelocity / Alpha</p>
        <h1>{props.title}</h1>
        <p>
          Generated presentation is not available yet. Run{" "}
          <code>pdd generate prompts/modules/alpha_application_ui_typescript.prompt</code>{" "}
          after contracts are accepted.
        </p>
        {props.siteId ? <p>Site id: {props.siteId}</p> : null}
      </header>
      <nav aria-label="Alpha product modules">
        <ul>
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.route === props.route ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
