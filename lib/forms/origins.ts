const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOSTED_FORM_HOSTS = new Set(["forms.router.so", ...LOCAL_HOSTS]);

export function normalizeOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid absolute site URL.");
  }

  if (url.username || url.password || url.hostname.includes("*")) {
    throw new Error("Origins cannot contain credentials or wildcards.");
  }

  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("Public form origins must use HTTPS.");
  }

  return url.origin.toLowerCase();
}

export function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const normalized = normalizeOrigin(origin);
    return origin === normalized ? normalized : null;
  } catch {
    return null;
  }
}

export function isHostedFormRequest(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = requestOrigin(request);
  return (
    HOSTED_FORM_HOSTS.has(requestUrl.hostname) &&
    origin === requestUrl.origin.toLowerCase()
  );
}
