// import "@/lib/db/config";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import {
  users,
  endpoints,
  logs,
  leads,
  forms,
  formCacheInvalidations,
  formOrigins,
  wordpressConnections,
  usagePeriods,
  formRateBuckets,
  formPlacementMilestones,
} from "./schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Endpoint = InferSelectModel<typeof endpoints>;
export type NewEndpoint = InferInsertModel<typeof endpoints>;

export type Log = InferSelectModel<typeof logs>;
export type NewLog = InferInsertModel<typeof logs>;

export type Lead = InferSelectModel<typeof leads>;
export type NewLead = InferInsertModel<typeof leads>;

export type Form = InferSelectModel<typeof forms>;
export type NewForm = InferInsertModel<typeof forms>;

export type FormCacheInvalidation = InferSelectModel<
  typeof formCacheInvalidations
>;

export type FormOrigin = InferSelectModel<typeof formOrigins>;
export type WordPressConnection = InferSelectModel<typeof wordpressConnections>;
export type UsagePeriod = InferSelectModel<typeof usagePeriods>;
export type FormRateBucket = InferSelectModel<typeof formRateBuckets>;
export type FormPlacementMilestone = InferSelectModel<
  typeof formPlacementMilestones
>;

export const db = drizzle(sql);
