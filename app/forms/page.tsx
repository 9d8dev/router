import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ExternalLink, FileText, PlugZap } from "lucide-react";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getForms } from "@/lib/data/forms";

export default async function FormsPage() {
  const result = await getForms();
  if (!result?.data || result.serverError) notFound();

  return (
    <>
      <Breadcrumbs pageName="Forms" />
      <PageWrapper>
        <div className="flex items-start justify-between gap-4 border-b pb-4 mb-6">
          <Header title="Forms">Published presentations for Router endpoints</Header>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/forms/wordpress"><PlugZap className="mr-2 h-4 w-4" /> WordPress</Link></Button>
            <Button asChild>
              <Link href="/forms/create"><Plus className="mr-2 h-4 w-4" /> New form</Link>
            </Button>
          </div>
        </div>
        {result.data.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-background/60 p-8 text-center">
            <div>
              <FileText className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <h2 className="text-lg font-medium">Build your first form</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Create a hosted, embeddable presentation for a new or existing endpoint.
                Your endpoint can still be used headlessly.
              </p>
              <Button className="mt-5" asChild>
                <Link href="/forms/create">Choose a starter</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {result.data.map((form) => (
              <article
                key={form.id}
                className="flex flex-col gap-4 rounded-xl border bg-background p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link className="truncate font-medium hover:underline" href={`/forms/${form.id}`}>
                      {form.name}
                    </Link>
                    <Badge variant={form.publishedAt ? "default" : "secondary"}>
                      {form.publishedAt ? `Published v${form.publishedRevision}` : "Draft"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Endpoint: {form.endpointName} · Draft revision {form.draftRevision}
                  </p>
                </div>
                <div className="flex gap-2">
                  {form.publishedAt && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`https://forms.router.so/${form.publicId}`} target="_blank" rel="noreferrer">
                        Open <ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" asChild>
                    <Link href={`/forms/${form.id}`}>Edit</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </PageWrapper>
    </>
  );
}
