import { NextResponse } from "next/server";
import { constructBodyFromURLParameters } from "@/lib/helpers/construct-body";
import { convertToCorrectTypes } from "@/lib/validation";
import { getPostingEndpointById } from "@/lib/data/endpoints";
import {
  acceptLead,
  LeadCapacityError,
  LeadEndpointError,
  LeadValidationError,
} from "@/lib/forms/lead-acceptance";
import {
  PayloadTooLargeError,
  readLimitedJsonBody,
} from "@/lib/forms/request-body";

const MAX_BODY_BYTES = 64 * 1024;

function errorResponse(error: unknown): NextResponse {
  if (error instanceof LeadValidationError) {
    return NextResponse.json(
      { error: "validation_failed", fields: error.fieldErrors },
      { status: 400 }
    );
  }
  if (error instanceof LeadCapacityError) {
    return NextResponse.json(
      { error: "monthly_capacity_reached", capacity: error.capacity },
      { status: 429 }
    );
  }
  if (error instanceof LeadEndpointError) {
    return NextResponse.json(
      {
        error: error.status === 404 ? "not_found" : "endpoint_disabled",
        message: error.message,
      },
      { status: error.status }
    );
  }
  console.error(error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

/** Legacy bearer-token endpoint. Its URL and authentication contract are unchanged. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { message: "Unauthorized. No valid bearer token provided." },
      { status: 401 }
    );
  }

  const endpoint = await getPostingEndpointById(id);
  if (!endpoint) {
    return NextResponse.json({ message: "Endpoint not found." }, { status: 404 });
  }
  if (endpoint.token !== authorization.slice("Bearer ".length)) {
    return NextResponse.json(
      { message: "Unauthorized. Invalid token provided." },
      { status: 401 }
    );
  }

  try {
    const values = await readLimitedJsonBody(request, MAX_BODY_BYTES);
    const result = await acceptLead({
      endpointId: id,
      values,
      placement: "headless",
    });
    return NextResponse.json({ success: true, id: result.leadId });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    return errorResponse(error);
  }
}

/** Compatibility route for existing native HTML forms. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const endpoint = await getPostingEndpointById(id);
  if (!endpoint) {
    return NextResponse.json({ message: "Endpoint not found." }, { status: 404 });
  }

  const referer = request.headers.get("referer");
  const rawValues = constructBodyFromURLParameters(
    new URL(request.url).searchParams
  );
  const values = convertToCorrectTypes(
    rawValues,
    endpoint.schema as GeneralSchema[]
  );

  try {
    await acceptLead({ endpointId: id, values, placement: "legacy_html" });
    return NextResponse.redirect(
      new URL(endpoint.successUrl || referer || "/success", request.url)
    );
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return NextResponse.redirect(
        new URL(endpoint.failUrl || referer || "/fail", request.url)
      );
    }
    return errorResponse(error);
  }
}
