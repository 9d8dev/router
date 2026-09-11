import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { getFormById } from "@/lib/data/forms";
import { getLeadsByForm } from "@/lib/data/leads";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function FormLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const [form, leads] = await Promise.all([
    getFormById({ id }),
    getLeadsByForm({ id, ...(cursor ? { cursor } : {}) }),
  ]);
  if (!form?.data || !leads?.data || form.serverError || leads.serverError) notFound();
  const page = leads.data;

  return (
    <>
      <Breadcrumbs pageName="Form leads" />
      <PageWrapper>
        <Header title={form.data.name}>Leads attributed to this form</Header>
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Placement</TableHead><TableHead>Revision</TableHead><TableHead>Values</TableHead></TableRow></TableHeader>
            <TableBody>
              {page.items.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="whitespace-nowrap">{lead.createdAt.toLocaleString()}</TableCell>
                  <TableCell>{lead.placement ?? "—"}</TableCell>
                  <TableCell>{lead.formRevision ?? "—"}</TableCell>
                  <TableCell><pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(lead.data, null, 2)}</pre></TableCell>
                </TableRow>
              ))}
              {page.items.length === 0 && <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">No leads from this form yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {(cursor || page.nextCursor) && (
          <nav aria-label="Form lead pages" className="mt-4 flex justify-end gap-2">
            {cursor && (
              <Button variant="outline" asChild>
                <Link href={`/forms/${id}/leads`}>Newest leads</Link>
              </Button>
            )}
            {page.nextCursor && (
              <Button variant="outline" asChild>
                <Link
                  href={`/forms/${id}/leads?cursor=${encodeURIComponent(page.nextCursor)}`}
                >
                  Older leads
                </Link>
              </Button>
            )}
          </nav>
        )}
      </PageWrapper>
    </>
  );
}
