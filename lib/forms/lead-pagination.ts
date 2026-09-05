import { z } from "zod";

export const FORM_LEADS_PAGE_SIZE = 50;

const leadCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1).max(255),
});

export type LeadCursor = z.infer<typeof leadCursorSchema>;

export function encodeLeadCursor(cursor: {
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
    "utf8"
  ).toString("base64url");
}

export function decodeLeadCursor(cursor: string): LeadCursor {
  try {
    return leadCursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
  } catch {
    throw new Error("Invalid lead cursor.");
  }
}
