import { Resend } from "resend";

let client: Resend | null = null;

export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
  client ??= new Resend(apiKey);
  return client;
}
