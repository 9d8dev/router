import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { getEndpoints } from "@/lib/data/endpoints";
import { CreateForm } from "@/components/groups/forms/create-form";

export default async function CreateFormPage({
  searchParams,
}: {
  searchParams: Promise<{ endpointId?: string }>;
}) {
  const endpoints = await getEndpoints();
  if (!endpoints?.data || endpoints.serverError) notFound();
  const { endpointId } = await searchParams;

  return (
    <>
      <Breadcrumbs pageName="New form" />
      <PageWrapper>
        <Header title="New form">Start fresh, use a starter, or attach an endpoint</Header>
        <CreateForm endpoints={endpoints.data} initialEndpointId={endpointId} />
      </PageWrapper>
    </>
  );
}
