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

export default async function FormLeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [form, leads] = await Promise.all([getFormById({ id }), getLeadsByForm({ id })]);
  if (!form?.data || !leads?.data || form.serverError || leads.serverError) notFound();

  return (
    <>
      <Breadcrumbs pageName="Form leads" />
      <PageWrapper>
        <Header title={form.data.name}>Leads attributed to this form</Header>
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Placement</TableHead><TableHead>Revision</TableHead><TableHead>Values</TableHead></TableRow></TableHeader>
            <TableBody>
              {leads.data.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="whitespace-nowrap">{lead.createdAt.toLocaleString()}</TableCell>
                  <TableCell>{lead.placement ?? "—"}</TableCell>
                  <TableCell>{lead.formRevision ?? "—"}</TableCell>
                  <TableCell><pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(lead.data, null, 2)}</pre></TableCell>
                </TableRow>
              ))}
              {leads.data.length === 0 && <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">No leads from this form yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </PageWrapper>
    </>
  );
}
