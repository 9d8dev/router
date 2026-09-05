import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { WordPressConnections } from "@/components/groups/forms/wordpress-connections";
import { getWordPressConnections } from "@/lib/data/wordpress";

export default async function WordPressPage() {
  const connections = await getWordPressConnections();
  if (!connections?.data || connections.serverError) notFound();

  return (
    <>
      <Breadcrumbs pageName="WordPress" />
      <PageWrapper>
        <Header title="WordPress">Connect Router forms to a WordPress site</Header>
        <WordPressConnections initialConnections={connections.data} />
      </PageWrapper>
    </>
  );
}
