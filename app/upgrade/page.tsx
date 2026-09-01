import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { PlanTiles } from "./plan-tiles";
import { getUsageForUser } from "@/lib/data/users";
import { notFound } from "next/navigation";

const pageData = {
  name: "Upgrade",
  title: "Upgrade",
  description: "Upgrade your plan to capture more leads",
};

export default async function Page() {
  const usage = await getUsageForUser();
  const { data: usageData, serverError: usageServerError } = usage || {};
  if (!usageData || usageServerError) notFound();

  return (
    <>
      <Breadcrumbs pageName={pageData?.name} />
      <PageWrapper>
        <Header title={pageData?.title}>{pageData?.description}</Header>
        <PlanTiles usage={usageData} />
      </PageWrapper>
    </>
  );
}
