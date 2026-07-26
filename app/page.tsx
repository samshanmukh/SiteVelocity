import type { Metadata } from "next";
import { NAV_GROUPS } from "@/components/model";
import styles from "./landing.module.css";

/**
 * Public landing page (Segment 8 — behavioral contract:
 * prompts/modules/public-landing-page-ui_typescript.prompt, R1–R17).
 *
 * Server-rendered, static, and self-contained: no provider probes, no
 * private APIs, no authentication, no client JavaScript required. The
 * capability summary is derived from the application's own NAV_GROUPS so
 * the marketing page can never claim a module state the app does not.
 */

export const metadata: Metadata = {
  title: "SiteVelocity — Find the sites that can move.",
  description:
    "The AI operating system for real estate development intelligence. Evidence-backed site discovery, research, and verification for professional developers. Alpha — San José, California.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SiteVelocity — Find the sites that can move.",
    description:
      "Evidence-backed development site intelligence: search, discover, research, verify, next step. Alpha — San José, California.",
    type: "website",
    siteName: "SiteVelocity",
  },
};

/** Live Alpha run facts — from data/candidates.json + data/sites/, July 25, 2026. */
const ALPHA_RUN = {
  label: "Live Alpha research run · San José, CA · July 25, 2026",
  sources:
    "Sources: City of San José AB 2011 screening (Apr 2024), County of Santa Clara parcels, San José zoning & General Plan GIS, FEMA NFHL.",
  stages: [
    { value: 87, name: "vacant parcels ingested", detail: "official City AB 2011 inventory" },
    { value: 23, name: "qualified", detail: "deterministic buy-box filter" },
    { value: 15, name: "shortlisted", detail: "ranked by Strategy Fit" },
    { value: 5, name: "researched", detail: "immutable Research Snapshots" },
  ],
} as const;

const WORKFLOW_STAGES = [
  {
    name: "Search",
    copy: "Declare your buy box — market, development type, site size, capacity, and the constraints you will not touch.",
  },
  {
    name: "Discover",
    copy: "Official public records become qualified candidates. Every record keeps its agency, dataset, and retrieval time.",
  },
  {
    name: "Research",
    copy: "Agents assemble land use, development history, and site risk from primary sources — never from guesswork.",
  },
  {
    name: "Verify",
    copy: "Deterministic rules score readiness and evidence confidence. AI is never the calculator of record.",
  },
  {
    name: "Next Step",
    copy: "The single action that most reduces uncertainty — what to do, who can resolve it, and how to prepare.",
  },
] as const;

const DIFFERENTIATORS = [
  {
    title: "LLMs interpret. TypeScript calculates.",
    copy: "Every score, ranking, and financial figure comes from deterministic typed code. AI reads the documents; it never grades its own homework.",
  },
  {
    title: "“Unknown” is an answer.",
    copy: "Missing evidence stays visible as unknown. “Not found” never becomes “does not exist” — and conflicts are preserved, not silently resolved.",
  },
  {
    title: "Every finding carries receipts.",
    copy: "Material findings link to their evidence: source agency, dataset, and retrieval time. If we can’t show where it came from, we don’t say it.",
  },
  {
    title: "Honest capability states.",
    copy: "Every module is labeled LIVE, PREVIEW, or ROADMAP — the same labels the application itself shows. No vaporware screens.",
  },
] as const;

const TECHNOLOGY_STACK = [
  {
    name: "RocketRide",
    role: "Selected workflow runtime",
    copy: "Runs portable property-research and candidate-ingestion workflows through the official TypeScript SDK, with authenticated Cloud execution, run tokens, diagnostics, and readiness checks.",
    featured: true,
  },
  {
    name: "Render Workflows",
    role: "Workflow fallback",
    copy: "Remains available as the alternative durable workflow backend without duplicating the same command across runtimes.",
  },
  {
    name: "Rtrvr.ai",
    role: "Public-web research",
    copy: "Finds relevant planning, permit, zoning, and development-history records across approved public sources.",
  },
  {
    name: "MiniMax",
    role: "Evidence extraction",
    copy: "Transforms retrieved documents into typed, evidence-linked property findings while deterministic code retains decision authority.",
  },
  {
    name: "Nexla",
    role: "Managed data ingestion",
    copy: "Normalizes government and property datasets while preserving source lineage before records enter the candidate pipeline.",
  },
  {
    name: "Supabase",
    role: "System of record",
    copy: "Stores organizations, sites, evidence, immutable snapshots, workflow runs, watchlists, preferences, and team access in PostgreSQL.",
  },
  {
    name: "Mapbox",
    role: "Spatial intelligence",
    copy: "Maps parcel centroids and ranked opportunities with candidate, zoning, and flood context for synchronized site review.",
  },
  {
    name: "ElevenLabs",
    role: "Scout voice",
    copy: "Lets users speak to Scout and hear concise briefings generated only from verified dossier content.",
  },
  {
    name: "Mem0",
    role: "Preference memory",
    copy: "Remembers investment and workflow preferences for personalized recommendations without treating memory as property evidence.",
  },
  {
    name: "Respan",
    role: "AI observability",
    copy: "Traces and evaluates retrieval, model, and workflow behavior so reliability can improve without hiding failures.",
  },
  {
    name: "Vercel",
    role: "Application hosting",
    copy: "Hosts the production Next.js application, server APIs, and public landing experience.",
  },
  {
    name: "PDD",
    role: "Development methodology",
    copy: "Turns product requirements into versioned prompts, behavioral contracts, tests, and implementation modules.",
  },
] as const;

const STACK_FLOW = ["Government records", "Nexla", "RocketRide", "Rtrvr + MiniMax", "Supabase", "Mapbox + Scout"] as const;

const STATUS_LABEL: Record<string, string> = {
  live: "LIVE",
  preview: "PREVIEW",
  roadmap: "ROADMAP",
};

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skipLink}>
        Skip to main content
      </a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            SV
          </span>
          <span className={styles.brandName}>SiteVelocity</span>
          <span className={styles.alphaBadge}>ALPHA</span>
        </div>
        <nav aria-label="Primary" className={styles.nav}>
          <a href="#workflow">How it works</a>
          <a href="#differentiators">Why it&rsquo;s different</a>
          <a href="#evidence">Evidence</a>
          <a href="#technology">Technology</a>
          <a href="#capability">What&rsquo;s live</a>
          <a href="/command-center" className={styles.navCta}>
            Open the app
          </a>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section id="hero" aria-labelledby="hero-heading" className={styles.hero}>
          <p className={styles.heroKicker}>Alpha &middot; San Jos&eacute;, California &middot; for professional real estate developers</p>
          <h1 id="hero-heading" className={styles.heroTitle}>
            Find the sites that can move.
          </h1>
          <p className={styles.heroStrap}>Don&rsquo;t search for land. Search for time.</p>
          <p className={styles.heroPositioning}>
            SiteVelocity is the AI operating system for real estate development intelligence &mdash; evidence-backed
            discovery, research, and verification for teams that put capital behind land decisions.
          </p>
          <div className={styles.heroActions}>
            <a href="/command-center" className={styles.primaryCta}>
              Open the Command Center
            </a>
            <a href="#workflow" className={styles.secondaryCta}>
              See how it works
            </a>
          </div>
        </section>

        {/* Problem */}
        <section id="problem" aria-labelledby="problem-heading" className={styles.section}>
          <h2 id="problem-heading">Finding land is easy. Deciding is hard.</h2>
          <p className={styles.sectionLead}>
            Development intelligence is fragmented across parcel GIS, zoning maps, municipal code, planning
            applications, permit portals, assessor records, title, tax, flood data, and utilities. After hours in all
            of them, the question is unchanged: <strong>is this site actually worth pursuing?</strong>
          </p>
          <p>
            Real estate developers don&rsquo;t have a property-search problem &mdash; they have a decision problem.
            SiteVelocity turns that decision into a repeatable, evidence-backed loop.
          </p>
        </section>

        {/* Workflow */}
        <section id="workflow" aria-labelledby="workflow-heading" className={styles.sectionAlt}>
          <h2 id="workflow-heading">One loop from raw records to a defensible next step</h2>
          <ol className={styles.workflow}>
            {WORKFLOW_STAGES.map((stage, index) => (
              <li key={stage.name} className={styles.workflowStage}>
                <span className={styles.workflowIndex} aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{stage.name}</h3>
                <p>{stage.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Differentiators */}
        <section id="differentiators" aria-labelledby="differentiators-heading" className={styles.section}>
          <h2 id="differentiators-heading">Built different where it matters</h2>
          <ul className={styles.differentiators}>
            {DIFFERENTIATORS.map((d) => (
              <li key={d.title} className={styles.differentiatorCard}>
                <h3>{d.title}</h3>
                <p>{d.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Evidence & trust */}
        <section id="evidence" aria-labelledby="evidence-heading" className={styles.sectionDark}>
          <h2 id="evidence-heading">Evidence first. Uncertainty preserved.</h2>
          <p className={styles.sectionLead}>
            SiteVelocity preserves evidence, uncertainty, and conflicts instead of papering over them. Findings that
            need a licensed professional are flagged <em>verification required</em> &mdash; they never quietly upgrade
            themselves to fact.
          </p>

          <figure className={styles.runProof} aria-labelledby="run-proof-caption">
            <div className={styles.runStages} role="list">
              {ALPHA_RUN.stages.map((stage) => (
                <div key={stage.name} role="listitem" className={styles.runStage}>
                  <span className={styles.runValue}>{stage.value}</span>
                  <span className={styles.runName}>{stage.name}</span>
                  <span className={styles.runDetail}>{stage.detail}</span>
                </div>
              ))}
            </div>
            <figcaption id="run-proof-caption" className={styles.runCaption}>
              {ALPHA_RUN.label}
              <br />
              {ALPHA_RUN.sources}
            </figcaption>
          </figure>

          <p className={styles.disclaimer}>
            SiteVelocity is decision support. It does not replace planners, surveyors, engineers, attorneys, title
            professionals, environmental consultants, lenders, or your own decision-makers &mdash; it prepares you for
            them.
          </p>
        </section>

        {/* Technology stack */}
        <section id="technology" aria-labelledby="technology-heading" className={styles.sectionAlt}>
          <h2 id="technology-heading">One system. Specialized infrastructure.</h2>
          <p className={styles.sectionLead}>
            SiteVelocity combines purpose-built workflow, retrieval, extraction, ingestion, mapping, voice, memory,
            and observability services behind one evidence-first product experience.
          </p>

          <div className={styles.stackFlow} role="list" aria-label="SiteVelocity technology flow">
            {STACK_FLOW.map((item, index) => (
              <div className={styles.stackFlowItem} key={item}>
                <span className={`${styles.stackNode} ${item === "RocketRide" ? styles.stackNodeSelected : ""}`} role="listitem">
                  {item}
                </span>
                {index < STACK_FLOW.length - 1 ? <span className={styles.stackArrow} aria-hidden="true">&rarr;</span> : null}
              </div>
            ))}
          </div>

          <div className={styles.technologyGrid}>
            {TECHNOLOGY_STACK.map((technology) => (
              <article
                key={technology.name}
                className={`${styles.technologyCard} ${"featured" in technology && technology.featured ? styles.technologyFeatured : ""}`}
              >
                <div className={styles.technologyCardHeader}>
                  <h3>{technology.name}</h3>
                  <span>{technology.role}</span>
                </div>
                <p>{technology.copy}</p>
                {technology.name === "RocketRide" ? (
                  <p className={styles.integrationState}>
                    Cloud authentication connected &middot; research and ingestion <code>.pipe</code> definitions being finalized
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        {/* Capability summary — derived from the application's own module registry (R7). */}
        <section id="capability" aria-labelledby="capability-heading" className={styles.section}>
          <h2 id="capability-heading">What&rsquo;s live today &mdash; exactly what the app says</h2>
          <p className={styles.sectionLead}>
            This list is generated from the application&rsquo;s own module registry, with the same three states the
            product shows: <strong>LIVE</strong> works on real public records now, <strong>PREVIEW</strong> is a
            truthful capability page without live data, and <strong>ROADMAP</strong> is planned.
          </p>
          <div className={styles.capabilityGroups}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className={styles.capabilityGroup}>
                <h3>{group.label}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <span>{item.label}</span>
                      <span className={`${styles.capBadge} ${styles[`cap_${item.status}`]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section id="get-started" aria-labelledby="cta-heading" className={styles.finalCta}>
          <h2 id="cta-heading">See the Alpha</h2>
          <p>Running on real San Jos&eacute; public records &mdash; every finding with its receipts.</p>
          <a href="/command-center" className={styles.primaryCta}>
            Open the Command Center
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <nav aria-label="Footer" className={styles.footerNav}>
          <a href="#problem">The problem</a>
          <a href="#workflow">How it works</a>
          <a href="#differentiators">Differentiators</a>
          <a href="#evidence">Evidence</a>
          <a href="#technology">Technology</a>
          <a href="#capability">Capability states</a>
          <a href="https://github.com/samshanmukh/SiteVelocity" rel="noopener noreferrer" target="_blank">
            Source on GitHub
          </a>
        </nav>
        <p className={styles.legal}>
          &copy; 2026 SiteVelocity &middot; Alpha software for evaluation &mdash; decision support, not professional
          advice.
        </p>
      </footer>
    </div>
  );
}
