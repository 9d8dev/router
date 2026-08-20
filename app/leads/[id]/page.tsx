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
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { getLeadData } from "@/lib/data/leads";
import { notFound } from "next/navigation";

const pageData = {
  name: "Lead data",
  title: "Lead data",
  description: "Breakdown of this lead's data",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const leadData = await getLeadData({ id });
  const { data, serverError } = leadData || {};

  if (!data || serverError) {
    return notFound();
  }

  const dataEntries = Object.entries(data.data as any);

  return (
    <>
      <Breadcrumbs leadId={id} />
      <PageWrapper>
        <Header title={pageData?.title}>{pageData?.description}</Header>
        <Table className="not-prose">
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              <TableCell>Field</TableCell>
              <TableCell>Value</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataEntries.map(([key, value], index) => (
              <TableRow key={index}>
                <TableCell>{key}</TableCell>
                <TableCell>{value as React.ReactNode}</TableCell>
              </TableRow>
            ))}
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
          <BreadcrumbLink href="/leads">Leads</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="px-2 py-1 bg-accent rounded-sm">
            {leadId}
          </BreadcrumbPage>
        </BreadcrumbItem>
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
