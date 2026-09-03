export function normalizePostHogHost(input: string): string {
  const candidate = input.trim();
  if (!candidate) throw new Error("PostHog host is empty.");
  const url = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
      ? candidate
      : `https://${candidate}`
  );
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PostHog host must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

export async function captureServerEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;
  try {
    const host = normalizePostHogHost(
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
    );
    await fetch(`${host.replace(/\/$/, "")}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event: input.event,
        properties: {
          distinct_id: input.distinctId,
          ...input.properties,
        },
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Analytics must never block form publication or lead acceptance.
  }
}
