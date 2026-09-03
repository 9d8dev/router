import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { getAttachableEndpoints } from "@/lib/data/endpoints";
import { CreateForm } from "@/components/groups/forms/create-form";
import { isEndpointSchemaCompatible } from "@/lib/forms/starters";

export default async function CreateFormPage({
  searchParams,
}: {
  searchParams: Promise<{ endpointId?: string }>;
}) {
  const endpoints = await getAttachableEndpoints();
  if (!endpoints?.data || endpoints.serverError) notFound();
  const { endpointId } = await searchParams;
  const compatibleEndpoints = endpoints.data.filter((endpoint) =>
    isEndpointSchemaCompatible(endpoint.schema)
  );
  const initialEndpointId = compatibleEndpoints.some(
    (endpoint) => endpoint.id === endpointId
  )
    ? endpointId
    : undefined;

  return (
    <>
      <Breadcrumbs pageName="New form" />
      <PageWrapper>
        <Header title="New form">Start fresh, use a starter, or attach an endpoint</Header>
        <CreateForm
          endpoints={compatibleEndpoints}
          initialEndpointId={initialEndpointId}
        />
      </PageWrapper>
    </>
  );
}
