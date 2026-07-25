import type { AppData, SnapshotView } from "../lib/view/app-data";
import type { CandidateSite } from "../lib/domain/site";
import type { EvidenceLevel } from "../lib/domain/schemas/core";

export type { AppData, SnapshotView };
export type { CandidateSite };

export type ModuleId =
  | "command" | "scout" | "map" | "sites" | "runs" | "next" | "dossier"
  | "datasources" | "info";

export type PaneMode =
  | "overview" | "evidence" | "history" | "agents" | "nextstep" | "score" | "scout";

export interface UiState {
  module: ModuleId;
  infoId: string | null;
  siteId: string | null;
  dossierTab: string;
  pane: boolean;
  paneMode: PaneMode;
  paneWidth: "narrow" | "medium" | "wide";
  prevMode: PaneMode;
  evidenceId: string | null;
  scoreSel: "strategyFit" | "developmentReadiness" | "evidenceConfidence";
  scoutThread: ScoutMessage[];
}

export interface ScoutMessage {
  q: string;
  kind: "TOOL-GENERATED RESULT" | "AI EXPLANATION";
  tool?: string;
  title: string;
  body: string;
  next?: string;
  actions: { label: string; mode: PaneMode; evidenceId?: string }[];
}

export const EVIDENCE_BADGES: Record<EvidenceLevel, { label: string; bg: string; color: string }> = {
  document_verified: { label: "Document Verified", bg: "#E9F4EC", color: "#167339" },
  gis_screened: { label: "GIS Screened", bg: "#EAF0FC", color: "#2557C7" },
  ai_researched: { label: "AI Researched", bg: "#FAF3DF", color: "#8F6400" },
  professional_verification_required: { label: "Verification Required", bg: "#FBECED", color: "#B22730" },
};

export function siteStatus(site: CandidateSite, snapshot: SnapshotView | undefined): { label: string; bg: string; color: string; edge: string } {
  if (snapshot?.snapshot.status === "complete") return { label: "INVESTIGATED", bg: "#E9F4EC", color: "#167339", edge: "#1F9D55" };
  if (snapshot) return { label: "INVESTIGATED*", bg: "#FAF3DF", color: "#8F6400", edge: "#D9A62E" };
  return { label: "CANDIDATE", bg: "#EAF0FC", color: "#2557C7", edge: "#2557C7" };
}

export function barColor(value: number): string {
  return value >= 85 ? "#1F9D55" : value >= 70 ? "#2557C7" : "#D9A62E";
}

export function agentLabel(agent: string): string {
  const labels: Record<string, string> = {
    scout: "Opportunity Scout",
    land_use: "Land Use",
    development_history: "Development History",
    site_risk: "Site Risk",
    verifier: "Verifier",
    next_best_action: "Next Best Action",
  };
  return labels[agent] ?? agent;
}

export function runStatusColor(status: string): { dot: string; text: string; anim: boolean } {
  if (status === "complete") return { dot: "#1F9D55", text: "#167339", anim: false };
  if (status === "running") return { dot: "#2557C7", text: "#2557C7", anim: true };
  if (status === "failed") return { dot: "#B22730", text: "#B22730", anim: false };
  return { dot: "#C9CED6", text: "#8A929E", anim: false };
}

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  status: "live" | "preview" | "roadmap";
  desc?: string;
  bullets?: string[];
  target?: { module: ModuleId; tab?: string };
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Primary",
    items: [
      { id: "command", icon: "▦", label: "Command Center", status: "live", target: { module: "command" } },
      { id: "scout", icon: "⌖", label: "Scout Opportunities", status: "live", target: { module: "scout" } },
      { id: "map", icon: "◈", label: "Opportunity Map", status: "live", target: { module: "map" } },
      { id: "sites", icon: "▤", label: "Sites", status: "live", target: { module: "sites" } },
      { id: "runs", icon: "◷", label: "Research Runs", status: "live", target: { module: "runs" } },
      { id: "next", icon: "➔", label: "Next Steps", status: "live", target: { module: "next" } },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "devevents", icon: "◉", label: "Development Events", status: "preview", desc: "Continuous detection of rezonings, approvals, permits, expirations, tax distress, ownership changes, and infrastructure catalysts across your watchlists.", bullets: ["Jurisdiction-wide rezoning and approval monitoring", "Entitlement expiration countdown alerts", "Tax distress and lien detection", "Infrastructure catalyst tracking from CIP and utility plans"] },
      { id: "watchlists", icon: "☆", label: "Watchlists", status: "preview", desc: "Standing watch over sites, markets, owners, REITs, and jurisdictions — every change lands as a development event.", bullets: ["Site, owner, and jurisdiction watchlists", "REIT and institutional portfolio tracking", "Snapshot-diff powered change detection"] },
      { id: "devhistory", icon: "≣", label: "Development History", status: "live", target: { module: "dossier", tab: "history" } },
      { id: "contactsmod", icon: "◎", label: "Contacts", status: "preview", desc: "Contact Intelligence: the specific public official or professional most likely to resolve each unknown, with preparation briefs.", bullets: ["Role-matched contact identification from public directories", "Conversation briefs generated from verified findings", "Interaction capture that feeds the evidence graph"] },
    ],
  },
  {
    label: "Property Analysis",
    items: [
      { id: "land", icon: "▱", label: "Land & Parcel", status: "preview", desc: "Canonical parcel record — boundary, APN reconciliation, acreage, access, recorded plats, and easements.", bullets: ["APN / deed / GIS / plat reconciliation", "Legal access verification", "Easement and encroachment screen"] },
      { id: "landuse", icon: "▨", label: "Land Use", status: "live", target: { module: "dossier", tab: "landuse" } },
      { id: "entitlements", icon: "✓", label: "Entitlements & Permits", status: "preview", desc: "Planning applications, approvals, conditions, and permit lifecycle for the parcel and its comparables.", bullets: ["Entitlement timeline and status", "Condition-of-approval catalog", "Permit lifecycle tracking"] },
      { id: "siteenv", icon: "≈", label: "Site & Environment", status: "live", target: { module: "dossier", tab: "siterisk" } },
      { id: "utilities", icon: "⌁", label: "Utilities & Infrastructure", status: "preview", desc: "Electricity, sewer, water, gas, fiber, and transportation — proximity, capacity signals, and the Utility Readiness Matrix.", bullets: ["Utility Readiness Matrix per site", "Capacity and will-serve signal detection", "Off-site obligation screening"] },
      { id: "title", icon: "§", label: "Title & Liens", status: "preview", desc: "Tax liens, mortgages, easements, covenants, and encumbrances assembled from recorder and tax data.", bullets: ["Encumbrance summary from recorded documents", "Delinquent tax and lien detection", "UCC fixture filing screen"] },
      { id: "ownership", icon: "◫", label: "Ownership & Capital", status: "preview", desc: "Owner and entity resolution, hold duration, REIT/institutional classification, and portfolio behavior.", bullets: ["LLC / entity resolution", "REIT and fund classification with SEC context", "Disposition pattern analysis"] },
      { id: "airrights", icon: "↟", label: "Air & Vertical Rights", status: "roadmap", desc: "Height, unused development rights, TDRs, rooftop rights, and FAA/avigation constraints.", bullets: ["Unused development right detection", "TDR program mapping", "FAA obstruction surface screening"] },
    ],
  },
  {
    label: "Feasibility",
    items: [
      { id: "envelope", icon: "⬒", label: "Buildable Envelope", status: "preview", desc: "What can physically fit: parcel boundary, setbacks, easement carve-outs, floodway overlays, and net developable area.", bullets: ["AI researches constraints; a deterministic envelope engine computes", "Setback and easement carve-out modeling", "Feeds Development Yield → Underwriting → IC"] },
      { id: "yield", icon: "∑", label: "Development Yield", status: "roadmap", desc: "What may fit: units, GFA, floors, and parking scenarios derived from zoning plus the buildable envelope.", bullets: ["FAR / density / height scenario engine", "Parking configuration modeling", "Deterministic yield calculations"] },
      { id: "underwriting", icon: "ƒ", label: "Underwriting", status: "roadmap", desc: "Development budget, sources & uses, cash flow, debt schedule, NOI, yield on cost, IRR/XIRR, NPV, equity multiple, residual land value, sensitivities.", bullets: ["AI researches assumptions — deterministic TypeScript tools calculate", "Versioned formulas with explicit units and tests", "Residual land value and sensitivity tables"] },
      { id: "ic", icon: "◧", label: "Investment Committee", status: "roadmap", desc: "Decision memos assembling evidence, risks, economics, and recommendation for committee review.", bullets: ["Auto-assembled IC memo with evidence links", "Risk register with verification status", "Pass / pursue decision log"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { id: "datasources", icon: "⊞", label: "Data Sources", status: "live", target: { module: "datasources" } },
      { id: "agentsettings", icon: "✦", label: "Agent Settings", status: "preview", desc: "Orchestrator configuration — which specialist capabilities run, verification depth, and spend limits.", bullets: ["Per-strategy agent selection", "Verification depth control", "Run budget limits"] },
      { id: "integrations", icon: "⇄", label: "Integrations", status: "roadmap", desc: "CRM, data room, and pipeline integrations.", bullets: ["CRM sync", "Export to data room", "Webhook events"] },
      { id: "team", icon: "◳", label: "Team", status: "roadmap", desc: "Members, roles, and site assignments.", bullets: ["Role-based access", "Site assignment and review queues"] },
    ],
  },
];
