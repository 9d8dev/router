import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { FormEditor } from "@/components/groups/forms/form-editor";
import { getFormById, getFormOrigins } from "@/lib/data/forms";

export default async function FormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [formResult, originResult] = await Promise.all([
    getFormById({ id }),
    getFormOrigins({ id }),
  ]);
  if (!formResult?.data || formResult.serverError) notFound();

  return (
    <>
      <Breadcrumbs pageName="Form editor" />
      <PageWrapper>
        <FormEditor form={formResult.data} origins={originResult?.data ?? []} />
      </PageWrapper>
    </>
  );
}
