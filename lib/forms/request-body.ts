export class PayloadTooLargeError extends Error {
  constructor() {
    super("Payload too large.");
    this.name = "PayloadTooLargeError";
  }
}

export async function readLimitedJsonBody(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) return JSON.parse("");

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
