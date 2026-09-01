import { NextResponse } from "next/server";
import { getPublishedForm } from "@/lib/data/forms";
import { isApprovedFormOrigin, publicCorsHeaders } from "@/lib/forms/public-access";
import { requestOrigin } from "@/lib/forms/origins";
import { publicFormsEnabled } from "@/lib/forms/feature-flags";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
) {
  if (!publicFormsEnabled()) {
    return NextResponse.json({ error: "form_not_found" }, { status: 404 });
  }
  const { publicId } = await params;
  const published = await getPublishedForm(publicId);
  if (!published) {
    return NextResponse.json(
      { error: "form_not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const origin = requestOrigin(request);
  const approved = origin
    ? (await isApprovedFormOrigin({ publicId, origin, placement: "embed" })) ||
      (await isApprovedFormOrigin({ publicId, origin, placement: "wordpress" }))
    : false;
  const headers = publicCorsHeaders(origin, approved);
  const etag = `W/\"${published.publicId}-${published.revision}\"`;
  headers.set("ETag", etag);
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
  );

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json(
    {
      publicId: published.publicId,
      revision: published.revision,
      definition: published.definition,
      attribution: published.showAttribution
        ? { visible: true, label: "Powered by Router", href: "https://router.so" }
        : { visible: false },
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
  const origin = requestOrigin(request);
  const approved = origin
    ? (await isApprovedFormOrigin({ publicId, origin, placement: "embed" })) ||
      (await isApprovedFormOrigin({ publicId, origin, placement: "wordpress" }))
    : false;
  return new NextResponse(null, {
    status: approved ? 204 : 403,
    headers: publicCorsHeaders(origin, approved),
  });
}
