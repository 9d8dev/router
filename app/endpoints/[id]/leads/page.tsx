import { getLeadsByEndpoint } from "@/lib/data/leads";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Home } from "lucide-react";
import Icon from "@/public/icon.svg";
import Image from "next/image";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { Header } from "@/components/parts/header";
import ExportCSV from "@/components/parts/export-csv";
import { notFound } from "next/navigation";

const pageData = {
  name: "Endpoint Leads",
  title: "Endpoint Leads",
  description: "All collected leads for this endpoint",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const leadsData = await getLeadsByEndpoint({
    id,
  });
  const { data, serverError } = leadsData || {};
  if (!data || serverError) notFound();
  const { leadData: leads, schema } = data;

  return (
    <>
      <Breadcrumbs leadId={id} />
      <PageWrapper>
        <Header title={pageData?.title}>{pageData?.description}</Header>
        <ExportCSV id={id} leads={leads} schema={schema} />
        <Table className="not-prose">
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              {schema.map((column) => (
                <TableCell key={column.key}>{column.key}</TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length > 0 ? (
              leads.map((lead, rowIndex) => (
                <TableRow key={rowIndex}>
                  {schema.map((column) => (
                    <TableCell key={column.key}>
                      {lead.data[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={schema.length} className="text-center">
                  No leads to show.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </PageWrapper>
    </>
  );
}

function Breadcrumbs({ leadId }: { leadId: string }) {
  return (
    <Breadcrumb className="h-[67.63px] bg-muted/50 rounded-lg border flex items-center justify-between p-6">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">
            <Home size={20} />
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/endpoints">Endpoints</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="px-2 py-1 bg-accent rounded-sm">
            {leadId}
          </BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>Leads</BreadcrumbItem>
      </BreadcrumbList>
      <Image
        className="hover:animate-spin dark:invert"
        src={Icon}
        width={24}
        height={24}
        alt="Router.so Icon"
      />
    </Breadcrumb>
  );
}
