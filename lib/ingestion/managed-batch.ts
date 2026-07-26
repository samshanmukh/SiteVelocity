import { z } from "zod";

export type ManagedJsonValue =
  | string
  | number
  | boolean
  | null
  | ManagedJsonValue[]
  | { [key: string]: ManagedJsonValue };

const JsonValueSchema: z.ZodType<ManagedJsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const ManagedDatasetKeySchema = z.enum([
  "san_jose_ab2011",
  "santa_clara_parcels",
]);
export type ManagedDatasetKey = z.infer<typeof ManagedDatasetKeySchema>;

export const ManagedIngestionBatchSchema = z.object({
  schemaVersion: z.literal("1.0"),
  organizationId: z.string().uuid(),
  provider: z.literal("nexla"),
  datasetKey: ManagedDatasetKeySchema,
  batchId: z.string().trim().min(1).max(255),
  source: z.object({
    agency: z.string().trim().min(1).max(240),
    dataset: z.string().trim().min(1).max(240),
    sourceUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "sourceUrl must use HTTPS"),
  }).strict(),
  retrievedAt: z.string().datetime({ offset: true }),
  records: z.array(z.object({
    externalRecordId: z.string().trim().min(1).max(500),
    sourceUpdatedAt: z.string().datetime({ offset: true }).optional(),
    payload: JsonObjectSchema,
  }).strict()).min(1).max(1000),
}).strict();

export type ManagedIngestionBatch = z.infer<typeof ManagedIngestionBatchSchema>;

export interface PersistedManagedIngestionBatch extends ManagedIngestionBatch {
  id: string;
  payloadChecksum: string;
  createdAt: string;
}
