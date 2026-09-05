import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedForm } from "@/lib/data/public-forms";
import {
  acceptLead,
  LeadCapacityError,
  LeadEndpointError,
  LeadStaleRevisionError,
  LeadValidationError,
} from "@/lib/forms/lead-acceptance";
import { isHostedFormRequest, requestOrigin } from "@/lib/forms/origins";
import {
  isApprovedFormOrigin,
  publicCorsHeaders,
  publicFormOptionsResponse,
} from "@/lib/forms/public-access";
import { enforceFormRateLimit, FormRateLimitError } from "@/lib/forms/rate-limit";
import {
  submissionTokenMatchesRequest,
  verifySubmissionToken,
} from "@/lib/forms/submission-token";
import { publicFormsEnabled } from "@/lib/forms/feature-flags";
import {
  PayloadTooLargeError,
  readLimitedJsonBody,
} from "@/lib/forms/request-body";

const MAX_BODY_BYTES = 64 * 1024;
const inputSchema = z.object({
  values: z.record(z.unknown()),
  submitToken: z.string().min(1),
  website: z.string().max(500).optional(),
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  if (!publicFormsEnabled()) {
    return NextResponse.json({ error: "form_not_found" }, { status: 404 });
  }
  const { publicId } = await params;
  const origin = requestOrigin(request);
  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(
      await readLimitedJsonBody(request, MAX_BODY_BYTES)
    );
  } catch (error) {
    const status = error instanceof PayloadTooLargeError ? 413 : 400;
    return NextResponse.json({ error: status === 413 ? "payload_too_large" : "invalid_request" }, { status });
  }

  let token;
  try {
    token = verifySubmissionToken(parsed.submitToken);
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_submit_token", message: error instanceof Error ? error.message : undefined },
      { status: 401 }
    );
  }

  if (!submissionTokenMatchesRequest(token, { publicId, origin })) {
    return NextResponse.json({ error: "invalid_submit_token" }, { status: 401 });
  }
  if (token.placement === "hosted") {
    if (!isHostedFormRequest(request)) {
      return NextResponse.json({ error: "origin_not_approved" }, { status: 403 });
    }
  } else {
    if (!origin) return NextResponse.json({ error: "origin_not_approved" }, { status: 403 });
    const approved = await isApprovedFormOrigin({
      publicId,
      origin,
      placement: token.placement,
    });
    if (!approved) return NextResponse.json({ error: "origin_not_approved" }, { status: 403 });
  }

  const form = await getPublishedForm(publicId);
  if (!form) return NextResponse.json({ error: "form_not_found" }, { status: 404 });
  const corsHeaders = publicCorsHeaders(origin, true);
  if (token.revision !== form.revision) {
    return NextResponse.json(
      { error: "stale_form_revision", revision: form.revision },
      { status: 409, headers: corsHeaders }
    );
  }

  try {
    await enforceFormRateLimit({ formId: form.id, ip: clientIp(request) });
    // Honeypot submissions count toward abuse limits, then receive a neutral
    // success without creating a lead.
    if (parsed.website) {
      return NextResponse.json(
        {
          leadId: "accepted",
          completion: { type: "message", message: "Thanks." },
        },
        { headers: corsHeaders }
      );
    }
    const result = await acceptLead({
      publicId,
      publishedRevision: token.revision,
      values: parsed.values,
      placement: token.placement,
    });
    return NextResponse.json(
      { leadId: result.leadId, completion: result.completion },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return NextResponse.json(
        { error: "validation_failed", fields: error.fieldErrors },
        { status: 400, headers: corsHeaders }
      );
    }
    if (error instanceof LeadCapacityError) {
      return NextResponse.json(
        { error: "monthly_capacity_reached", capacity: error.capacity },
        { status: 429, headers: corsHeaders }
      );
    }
    if (error instanceof LeadStaleRevisionError) {
      return NextResponse.json(
        { error: "stale_form_revision", revision: error.currentRevision },
        { status: 409, headers: corsHeaders }
      );
    }
    if (error instanceof FormRateLimitError) {
      corsHeaders.set("Retry-After", String(error.retryAfter));
      return NextResponse.json(
        { error: "rate_limited", retryAfter: error.retryAfter },
        { status: 429, headers: corsHeaders }
      );
    }
    if (error instanceof LeadEndpointError) {
      return NextResponse.json(
        { error: error.status === 404 ? "form_not_found" : "form_disabled" },
        { status: error.status, headers: corsHeaders }
      );
    }
    console.error(error);
    return NextResponse.json({ error: "internal_error" }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  if (!publicFormsEnabled()) return new NextResponse(null, { status: 404 });
  const { publicId } = await params;
  return publicFormOptionsResponse(request, publicId);
}
