import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Header } from "@/components/parts/header";
import EditForm from "@/components/groups/endpoints/edit-form";
import { Home } from "lucide-react";
import { PageWrapper } from "@/components/parts/page-wrapper";
import Image from "next/image";
import Icon from "@/public/icon.svg";
import { getEndpointById } from "@/lib/data/endpoints";
import Link from "next/link";
import { notFound } from "next/navigation";

const pageData = {
  name: "Edit Endpoint",
  title: "Edit Your Endpoint",
  description: "Edit your endpoint.",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // fetch endpoint data
  const endpoint = await getEndpointById({ id });
  const { data: endpointData, serverError } = endpoint || {};

  // check for errors
  if (!endpointData || serverError) notFound();

  return (
    <>
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
            <Link href={`/endpoints/${id}`}>
              <BreadcrumbPage className="px-2 py-1 bg-accent rounded-sm">
                {id}
              </BreadcrumbPage>
            </Link>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Edit</BreadcrumbItem>
        </BreadcrumbList>
        <Image
          className="hover:animate-spin dark:invert"
          src={Icon}
          width={24}
          height={24}
          alt="Router.so Icon"
        />
      </Breadcrumb>
      <PageWrapper>
        <Header title={pageData?.title}>{pageData?.description}</Header>
        <EditForm id={id} endpoint={endpointData} />
      </PageWrapper>
    </>
  );
}
