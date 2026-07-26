"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  FeasibilityAssumptions,
  FeasibilityScenario,
} from "@/lib/domain/feasibility";

export type FeasibilityMode = "envelope" | "yield" | "underwriting" | "ic";

const DEFAULTS: FeasibilityAssumptions = {
  setbackPercent: 0.15,
  nonBuildablePercent: 0.1,
  far: 2.5,
  densityUnitsPerAcre: 80,
  maxStories: 5,
  parkingSpacesPerUnit: 0.75,
  averageUnitSqFt: 850,
  residentialEfficiency: 0.82,
  landPrice: 8_000_000,
  hardCostPerGrossSqFt: 350,
  softCostPercent: 0.25,
  monthlyRentPerUnit: 3_200,
  monthlyOtherIncomePerUnit: 150,
  operatingExpensePercent: 0.32,
  exitCapRate: 0.05,
  loanToCost: 0.65,
  annualInterestRate: 0.065,
  targetProfitMargin: 0.15,
};

const FIELDS: Array<{
  key: keyof FeasibilityAssumptions;
  label: string;
  step: number;
  percent?: boolean;
}> = [
  { key: "setbackPercent", label: "Setback deduction", step: 1, percent: true },
  { key: "nonBuildablePercent", label: "Other non-buildable", step: 1, percent: true },
  { key: "far", label: "FAR", step: 0.1 },
  { key: "densityUnitsPerAcre", label: "Units / acre", step: 1 },
  { key: "maxStories", label: "Max stories", step: 1 },
  { key: "parkingSpacesPerUnit", label: "Parking / unit", step: 0.05 },
  { key: "averageUnitSqFt", label: "Average unit sf", step: 25 },
  { key: "residentialEfficiency", label: "Residential efficiency", step: 1, percent: true },
  { key: "landPrice", label: "Land price ($)", step: 100_000 },
  { key: "hardCostPerGrossSqFt", label: "Hard cost / GSF ($)", step: 5 },
  { key: "softCostPercent", label: "Soft cost", step: 1, percent: true },
  { key: "monthlyRentPerUnit", label: "Monthly rent / unit ($)", step: 50 },
  { key: "monthlyOtherIncomePerUnit", label: "Other income / unit ($)", step: 25 },
  { key: "operatingExpensePercent", label: "Operating expenses", step: 1, percent: true },
  { key: "exitCapRate", label: "Exit cap rate", step: 0.1, percent: true },
  { key: "loanToCost", label: "Loan to cost", step: 1, percent: true },
  { key: "annualInterestRate", label: "Interest rate", step: 0.1, percent: true },
  { key: "targetProfitMargin", label: "Target value margin", step: 1, percent: true },
];

function number(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function percent(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function Metrics({ scenario, mode }: { scenario: FeasibilityScenario; mode: FeasibilityMode }) {
  const { outputs } = scenario;
  const rows: Array<[string, string]> = mode === "envelope"
    ? [
        ["Gross parcel", `${number(outputs.envelope.grossParcelSqFt)} sf`],
        ["Setback deduction", `${number(outputs.envelope.setbackDeductionSqFt)} sf`],
        ["Other non-buildable", `${number(outputs.envelope.nonBuildableDeductionSqFt)} sf`],
        ["Net buildable site", `${number(outputs.envelope.netBuildableSiteSqFt)} sf`],
        ["Maximum 3D envelope", `${number(outputs.envelope.maxEnvelopeGrossSqFt)} gsf`],
      ]
    : mode === "yield"
      ? [
          ["FAR-limited area", `${number(outputs.yield.zoningFarGrossSqFt)} gsf`],
          ["Modeled gross building", `${number(outputs.yield.grossBuildingSqFt)} gsf`],
          ["Units by area", number(outputs.yield.unitsByArea)],
          ["Units by density", number(outputs.yield.unitsByDensity)],
          ["Screening yield", `${number(outputs.yield.units)} units`],
          ["Parking demand", `${number(outputs.yield.parkingSpaces)} spaces`],
        ]
      : mode === "underwriting"
        ? [
            ["Total development cost", money(outputs.underwriting.totalDevelopmentCost)],
            ["Stabilized NOI", money(outputs.underwriting.stabilizedNoi)],
            ["Stabilized value", money(outputs.underwriting.stabilizedValue)],
            ["Yield on cost", percent(outputs.underwriting.yieldOnCost)],
            ["Value margin", percent(outputs.underwriting.valueMargin)],
            ["Debt / equity", `${money(outputs.underwriting.debt)} / ${money(outputs.underwriting.equity)}`],
            ["Annual interest", money(outputs.underwriting.annualInterest)],
            ["Equity multiple at stabilization", outputs.underwriting.equityMultipleAtStabilization === null ? "N/A" : `${outputs.underwriting.equityMultipleAtStabilization.toFixed(2)}×`],
            ["Residual land value before target profit", money(outputs.underwriting.residualLandValueBeforeTargetProfit)],
          ]
        : [];

  if (mode === "ic") {
    const color = outputs.investmentCommittee.recommendation === "pursue" ? "var(--green-text)" : outputs.investmentCommittee.recommendation === "pass" ? "var(--red)" : "var(--amber-text)";
    return (
      <div>
        <div className="sv-section-label">Deterministic screening recommendation</div>
        <div style={{ fontSize: 28, fontWeight: 800, color }}>{outputs.investmentCommittee.recommendation.toUpperCase()}</div>
        {outputs.investmentCommittee.reasons.map((reason) => <div className="sv-row" style={{ cursor: "default" }} key={reason}>{reason}</div>)}
        <p className="sv-note" style={{ marginTop: 10 }}>This is a rules-based screen, not an investment decision. Open evidence gaps and declared assumptions remain visible.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="sv-section-label">{scenario.name} · v{scenario.calculationVersion}</div>
      {rows.map(([label, value]) => (
        <div className="sv-row" style={{ cursor: "default" }} key={label}>
          <span style={{ flex: 1 }}>{label}</span><strong className="mono">{value}</strong>
        </div>
      ))}
      {outputs.warnings.map((warning) => <div className="sv-callout" style={{ marginTop: 7 }} key={warning}>{warning}</div>)}
    </div>
  );
}

export function FeasibilityStudio({
  siteId,
  mode,
  scenarios,
}: {
  siteId: string;
  mode: FeasibilityMode;
  scenarios: FeasibilityScenario[];
}) {
  const router = useRouter();
  const [assumptions, setAssumptions] = useState(DEFAULTS);
  const [name, setName] = useState("Base screening scenario");
  const [latest, setLatest] = useState<FeasibilityScenario | null>(scenarios[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const fields = useMemo(() => FIELDS, []);

  const calculate = async () => {
    setBusy(true);
    setIssue(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/feasibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, assumptions }),
      });
      if (!response.ok) throw new Error("scenario_failed");
      const scenario = await response.json() as FeasibilityScenario;
      setLatest(scenario);
      router.refresh();
    } catch {
      setIssue("The scenario could not be saved. Confirm that sourced acreage exists and every assumption is within its declared bound.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sv-grid2">
      <section className="sv-panel sv-panel-pad">
        {latest ? <Metrics scenario={latest} mode={mode} /> : <div className="sv-empty">No saved scenario yet. Declare assumptions and calculate one.</div>}
      </section>
      <section className="sv-panel sv-panel-pad">
        <div className="sv-section-label">Declared scenario assumptions</div>
        <input className="sv-search" aria-label="Scenario name" value={name} onChange={(event) => setName(event.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          {fields.map((field) => (
            <label key={field.key} style={{ fontSize: 10.5, color: "var(--text-2)" }}>
              {field.label}{field.percent ? " (%)" : ""}
              <input
                className="sv-search"
                type="number"
                step={field.step}
                value={field.percent ? assumptions[field.key] * 100 : assumptions[field.key]}
                onChange={(event) => {
                  const raw = Number(event.target.value);
                  setAssumptions((current) => ({ ...current, [field.key]: field.percent ? raw / 100 : raw }));
                }}
                style={{ marginTop: 3 }}
              />
            </label>
          ))}
        </div>
        <button className="sv-btn" disabled={busy || !name.trim()} onClick={() => void calculate()} style={{ marginTop: 12 }}>
          {busy ? "CALCULATING…" : "CALCULATE & SAVE VERSION"}
        </button>
        {issue ? <div className="sv-callout" style={{ marginTop: 8, color: "var(--red)" }}>{issue}</div> : null}
      </section>
    </div>
  );
}
