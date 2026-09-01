export async function captureServerEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
  try {
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
