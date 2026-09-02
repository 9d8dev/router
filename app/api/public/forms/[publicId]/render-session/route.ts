import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedForm } from "@/lib/data/public-forms";
import { isHostedFormRequest, requestOrigin } from "@/lib/forms/origins";
import {
  isApprovedFormOrigin,
  publicCorsHeaders,
  publicFormOptionsResponse,
} from "@/lib/forms/public-access";
import { createSubmissionToken } from "@/lib/forms/submission-token";
import { publicFormsEnabled } from "@/lib/forms/feature-flags";

const inputSchema = z.object({
  placement: z.enum(["hosted", "embed", "wordpress"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  if (!publicFormsEnabled()) {
    return NextResponse.json({ error: "form_not_found" }, { status: 404 });
  }
  const { publicId } = await params;
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "invalid_placement" }, { status: 400 });
  }

  const form = await getPublishedForm(publicId);
  if (!form) return NextResponse.json({ error: "form_not_found" }, { status: 404 });

  const origin = requestOrigin(request);
  let approved = false;
  if (input.data.placement === "hosted") {
    approved = isHostedFormRequest(request);
  } else if (origin) {
    approved = await isApprovedFormOrigin({
      publicId,
      origin,
      placement: input.data.placement,
    });
  }

  if (!approved || !origin) {
    return NextResponse.json(
      { error: "origin_not_approved" },
      { status: 403, headers: publicCorsHeaders(origin, false) }
    );
  }

  const headers = publicCorsHeaders(origin, Boolean(origin));
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(
    {
      submitToken: createSubmissionToken({
        publicId,
        revision: form.revision,
        placement: input.data.placement,
        origin,
      }),
      revision: form.revision,
      expiresIn: 3600,
    },
    { headers }
  );
}

export async function OPTIONS(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  if (!publicFormsEnabled()) return new NextResponse(null, { status: 404 });
  const { publicId } = await params;
  return publicFormOptionsResponse(request, publicId);
}
