import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type FormPlacement = "hosted" | "embed" | "wordpress";

type SubmissionTokenInput = {
  publicId: string;
  placement: FormPlacement;
  origin?: string;
};

export type SubmissionTokenPayload = SubmissionTokenInput & {
  audience: "router-form-submission";
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

type TokenOptions = {
  secret?: string;
  now?: Date;
};

function signingSecret(explicit?: string): string {
  const secret =
    explicit ?? process.env.FORM_SUBMISSION_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("FORM_SUBMISSION_SECRET or AUTH_SECRET must be configured.");
  }
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSubmissionToken(
  input: SubmissionTokenInput,
  options: TokenOptions = {}
): string {
  const now = options.now ?? new Date();
  const payload: SubmissionTokenPayload = {
    audience: "router-form-submission",
    publicId: input.publicId,
    placement: input.placement,
    ...(input.origin ? { origin: input.origin } : {}),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1_000).toISOString(),
    nonce: randomBytes(12).toString("base64url"),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, signingSecret(options.secret))}`;
}

export function verifySubmissionToken(
  token: string,
  options: TokenOptions = {}
): SubmissionTokenPayload {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    throw new Error("Invalid submission token.");
  }

  const expected = Buffer.from(
    sign(encodedPayload, signingSecret(options.secret)),
    "utf8"
  );
  const actual = Buffer.from(signature, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid submission token.");
  }

  let payload: SubmissionTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SubmissionTokenPayload;
  } catch {
    throw new Error("Invalid submission token.");
  }

  if (
    payload.audience !== "router-form-submission" ||
    !payload.publicId ||
    !["hosted", "embed", "wordpress"].includes(payload.placement)
  ) {
    throw new Error("Invalid submission token.");
  }

  const now = options.now ?? new Date();
  if (!Number.isFinite(Date.parse(payload.expiresAt)) || now >= new Date(payload.expiresAt)) {
    throw new Error("Submission token has expired.");
  }

  return payload;
}
