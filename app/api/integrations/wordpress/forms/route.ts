import { NextResponse } from "next/server";
import { listPublishedFormsForWordPressToken } from "@/lib/data/wordpress";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "missing_site_token" }, { status: 401 });
  }

  const forms = await listPublishedFormsForWordPressToken(
    authorization.slice("Bearer ".length)
  );
  if (!forms) {
    return NextResponse.json({ error: "invalid_or_revoked_site_token" }, { status: 401 });
  }

  return NextResponse.json(
    {
      forms: forms.map((form) => ({
        publicId: form.publicId,
        name: form.name,
        title: form.title?.title ?? form.name,
        revision: form.revision,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
