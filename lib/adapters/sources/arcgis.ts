import { z } from "zod";
import { fetchSourceJson } from "./http-json";

/** Minimal ArcGIS REST query client for public feature/map services. */

export const ArcgisFeatureSchema = z.object({
  attributes: z.record(z.string(), z.unknown()),
  geometry: z.unknown().optional(),
});
export type ArcgisFeature = z.infer<typeof ArcgisFeatureSchema>;

const ArcgisQueryResponseSchema = z.object({
  features: z.array(ArcgisFeatureSchema).default([]),
  exceededTransferLimit: z.boolean().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
}).passthrough();

export interface ArcgisQueryOptions {
  where?: string;
  outFields?: string;
  resultRecordCount?: number;
  resultOffset?: number;
  returnGeometry?: boolean;
  outSR?: number;
  geometry?: { x: number; y: number };
  inSR?: number;
}

export async function queryArcgis(layerUrl: string, options: ArcgisQueryOptions = {}): Promise<ArcgisFeature[]> {
  const params = new URLSearchParams({
    where: options.where ?? "1=1",
    outFields: options.outFields ?? "*",
    f: "json",
    returnGeometry: String(options.returnGeometry ?? false),
  });
  if (options.resultRecordCount !== undefined) params.set("resultRecordCount", String(options.resultRecordCount));
  if (options.resultOffset !== undefined) params.set("resultOffset", String(options.resultOffset));
  if (options.outSR !== undefined) params.set("outSR", String(options.outSR));
  if (options.geometry) {
    params.set("geometry", `${options.geometry.x},${options.geometry.y}`);
    params.set("geometryType", "esriGeometryPoint");
    params.set("spatialRel", "esriSpatialRelIntersects");
    params.set("inSR", String(options.inSR ?? 4326));
  }

  const payload = await fetchSourceJson(`${layerUrl}/query?${params.toString()}`);
  const parsed = ArcgisQueryResponseSchema.parse(payload);
  if (parsed.error) {
    throw new Error(`ArcGIS query failed: ${parsed.error.code} ${parsed.error.message}`);
  }
  return parsed.features;
}
