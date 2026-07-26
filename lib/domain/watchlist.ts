import { z } from "zod";

export const WatchlistSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable(),
  siteIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type Watchlist = z.infer<typeof WatchlistSchema>;

export const CreateWatchlistSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
});

export const AddWatchlistSiteSchema = z.object({
  siteId: z.string().trim().min(1).max(255),
});
