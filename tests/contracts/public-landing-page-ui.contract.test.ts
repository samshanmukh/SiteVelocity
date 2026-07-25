import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import Module, { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NAV_GROUPS } from "../../components/model";

// Stub CSS-module imports for the CJS path tsx compiles tests to: each class
// name resolves to itself so class-based assertions stay possible.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (
  mod,
) => {
  const proxy: unknown = new Proxy(
    {},
    {
      get: (_t, p) => {
        if (p === "__esModule") return undefined; // keep CJS/ESM interop honest
        if (p === "default") return proxy; // default export is the class map itself
        return typeof p === "string" ? p : "";
      },
    },
  );
  mod.exports = proxy;
};

/**
 * Contract tests for prompts/modules/public-landing-page-ui_typescript.prompt.
 * Each test name declares the rule IDs it verifies (R1–R15, U1–U8 where
 * statically verifiable, P1–P8 where observable).
 * No test performs any network call and no test starts a browser; the page is
 * rendered through react-dom/server exactly as Next would server-render it.
 */

const repoRoot = path.join(__dirname, "..", "..");
register(pathToFileURL(path.join(__dirname, "..", "support", "css-stub.mjs")).href);

type PageModule = {
  default: () => unknown;
  metadata: {
    title?: string;
    description?: string;
    alternates?: { canonical?: string };
    openGraph?: Record<string, unknown>;
  };
};

let cached: { mod: PageModule; html: string } | null = null;

async function renderPage(): Promise<{ mod: PageModule; html: string }> {
  if (cached) return cached;
  const mod = (await import("../../app/page")) as unknown as PageModule;
  const html = renderToStaticMarkup(createElement(mod.default as never));
  cached = { mod, html };
  return cached;
}

const pageSource = readFileSync(path.join(repoRoot, "app", "page.tsx"), "utf8");

test("R1/U1: one semantic page — header, primary nav, exactly one h1, main, footer", async () => {
  const { html } = await renderPage();
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one h1");
  assert.match(html, /<header[\s>]/);
  assert.match(html, /<nav[^>]*aria-label="Primary"/);
  assert.match(html, /<main[\s>]/);
  assert.match(html, /<footer[\s>]/);
  assert.ok(!/[<]h[56][\s>]/.test(html), "no h5/h6 — heading hierarchy stays shallow");
});

test("R2: approved headline as h1, strapline, positioning, audience, visible Alpha status", async () => {
  const { html } = await renderPage();
  assert.match(html, /<h1[^>]*>[^<]*Find the sites that can move\./);
  assert.ok(html.includes("Don’t search for land. Search for time."), "strapline present");
  assert.ok(
    html.includes("AI operating system for real estate development intelligence"),
    "positioning line present",
  );
  assert.match(html, /professional real estate developers/i);
  assert.ok(html.includes(">ALPHA<"), "visible Alpha badge");
});

test("R3: five-stage loop appears in order — Search, Discover, Research, Verify, Next Step", async () => {
  const { html } = await renderPage();
  const positions = ["Search", "Discover", "Research", "Verify", "Next Step"].map((stage) => {
    const index = html.indexOf(`<h3>${stage}</h3>`);
    assert.notEqual(index, -1, `stage heading for ${stage}`);
    return index;
  });
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1], "stages render in declared order");
  }
});

test("R4: required section set present, each with a stable id and heading", async () => {
  const { html } = await renderPage();
  for (const id of ["hero", "problem", "workflow", "differentiators", "evidence", "capability", "get-started"]) {
    assert.match(html, new RegExp(`<section[^>]*id="${id}"[^>]*aria-labelledby=`), `section #${id}`);
  }
});

test("R5: evidence model explained — evidence, uncertainty, conflicts, professional verification", async () => {
  const { html } = await renderPage();
  assert.match(html, /preserves evidence, uncertainty, and conflicts/);
  assert.match(html, /verification required/i);
});

test("R6/U6: primary CTA → /command-center, secondary → on-page anchor, no dead controls, no forms", async () => {
  const { html } = await renderPage();
  assert.ok((html.match(/href="\/command-center"/g) ?? []).length >= 2, "primary CTA present in hero and final CTA");
  assert.match(html, /href="#workflow"/);
  assert.ok(!html.includes("<button"), "no buttons — every control is a working link");
  assert.ok(!html.includes("<form"), "no unimplemented forms");
  assert.ok(existsSync(path.join(repoRoot, "app", "command-center", "page.tsx")), "/command-center route exists");
});

test("R7/U5: capability summary is derived from NAV_GROUPS and badge counts match the registry exactly", async () => {
  const { html } = await renderPage();
  const counts = { live: 0, preview: 0, roadmap: 0 };
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      counts[item.status] += 1;
      const escaped = item.label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#x27;");
      assert.ok(html.includes(`<span>${escaped}</span>`), `module listed: ${item.label}`);
    }
  }
  assert.equal((html.match(/cap_live/g) ?? []).length, counts.live, "LIVE badge count matches registry");
  assert.equal((html.match(/cap_preview/g) ?? []).length, counts.preview, "PREVIEW badge count matches registry");
  assert.equal((html.match(/cap_roadmap/g) ?? []).length, counts.roadmap, "ROADMAP badge count matches registry");
  assert.ok(pageSource.includes("NAV_GROUPS"), "summary is derived from the registry, not restated");
});

test("R8/P7: no fabricated metrics, testimonials, logos, pricing, or production claims", async () => {
  const { html } = await renderPage();
  const banned = [
    "testimonial",
    "Trusted by",
    "our customers",
    "per month",
    "/mo",
    "pricing",
    "$",
    "guarantee",
    "production-ready",
    "1,284", // the pitch-deck demo funnel must never appear on the public page
  ];
  for (const phrase of banned) {
    assert.ok(!html.toLowerCase().includes(phrase.toLowerCase()), `banned phrase absent: ${phrase}`);
  }
});

test("R9/P2: every numeric product claim is a labeled run figure matching persisted run artifacts", async () => {
  const { html } = await renderPage();
  const funnel = JSON.parse(readFileSync(path.join(repoRoot, "data", "candidates.json"), "utf8")).funnel as {
    rawRecords: number;
    qualified: number;
    shortlisted: number;
  };
  const researchedSites = readdirSync(path.join(repoRoot, "data", "sites")).length;

  // The displayed figures must equal the persisted artifacts — drift fails the build.
  for (const value of [funnel.rawRecords, funnel.qualified, funnel.shortlisted, researchedSites]) {
    assert.match(html, new RegExp(`>${value}<`), `run figure ${value} shown`);
  }
  // …and they must be labeled with date, market, and sources in the same figure.
  const figure = html.slice(html.indexOf("<figure"), html.indexOf("</figure>"));
  assert.match(figure, /July 25, 2026/);
  assert.match(figure, /San José/);
  assert.match(figure, /Sources:/);
});

test("R10: decision-support statement names every profession", async () => {
  const { html } = await renderPage();
  for (const profession of [
    "planners",
    "surveyors",
    "engineers",
    "attorneys",
    "title professionals",
    "environmental consultants",
    "lenders",
    "decision-makers",
  ]) {
    assert.ok(html.includes(profession), `names ${profession}`);
  }
  assert.match(html, /decision support/i);
});

test("R11 (negative): rendering / performs no provider probe even when fetch is booby-trapped", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("NETWORK_ACCESS_ATTEMPTED");
  }) as typeof fetch;
  try {
    cached = null;
    const { html } = await renderPage();
    assert.ok(html.length > 2000, "page rendered fully with fetch disabled");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("R11 (structural): the root route imports no provider, readiness, or app-data module", () => {
  for (const forbidden of ["lib/providers", "app-data", "api/integrations", "checkProviderConnections", "loadAppData", "fetch("]) {
    assert.ok(!pageSource.includes(forbidden), `page source free of ${forbidden}`);
  }
});

test("R12/P4/U4: synchronous server component — deterministic static markup, no client scripts", async () => {
  const { mod } = await renderPage();
  assert.notEqual(mod.default.constructor.name, "AsyncFunction", "component is synchronous");
  const a = renderToStaticMarkup(createElement(mod.default as never));
  const b = renderToStaticMarkup(createElement(mod.default as never));
  assert.equal(a, b, "identical output on repeated renders");
  assert.ok(!a.includes("<script"), "no script tags — core content useful without JavaScript");
});

test("R13: metadata — accurate title, description, canonical; no image references to assets that do not exist", async () => {
  const { mod } = await renderPage();
  assert.match(String(mod.metadata.title), /SiteVelocity/);
  assert.ok((mod.metadata.description ?? "").length > 40, "substantive description");
  assert.equal(mod.metadata.alternates?.canonical, "/");
  assert.ok(mod.metadata.openGraph, "openGraph present");
  assert.ok(!("images" in (mod.metadata.openGraph ?? {})), "no social image claimed — none exists in the repo");
});

test("R14/U2/U3/U8: skip link, alt text, safe external links, reduced-motion guard in stylesheet", async () => {
  const { html } = await renderPage();
  assert.match(html, /href="#main"/);
  const images = html.match(/<img[^>]*>/g) ?? [];
  for (const img of images) {
    assert.match(img, /alt="/, "every image has alt text");
  }
  const externalLinks = html.match(/<a[^>]*target="_blank"[^>]*>/g) ?? [];
  assert.ok(externalLinks.length > 0, "external source link present");
  for (const link of externalLinks) {
    assert.match(link, /rel="noopener noreferrer"/, "external links are noopener noreferrer");
  }
  const css = readFileSync(path.join(repoRoot, "app", "landing.module.css"), "utf8");
  assert.match(css, /prefers-reduced-motion/, "motion is gated on prefers-reduced-motion");
  assert.match(css, /focus-visible/, "visible focus styles declared");
});

test("R15/P8: no environment, credential, or request-state reads; no provider SDK types", () => {
  assert.ok(!pageSource.includes("process.env"), "no environment reads");
  assert.ok(!pageSource.includes("cookies(") && !pageSource.includes("headers("), "no request state");
  assert.ok(!pageSource.includes("@renderinc") && !pageSource.includes("@supabase"), "no provider SDK imports");
});
