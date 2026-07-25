import type { ReactNode } from "react";

/**
 * Product shell layout for Alpha application routes.
 * Provider readiness remains on `/` (Segment 8 will own the public landing).
 * Product entry is `/command-center`.
 */
export default function ProductLayout(props: { children: ReactNode }) {
  return <div data-shell="alpha-product">{props.children}</div>;
}
