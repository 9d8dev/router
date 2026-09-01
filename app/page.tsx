import Link from "next/link";

import { Breadcrumbs } from "@/components/parts/breadcrumbs";
import { Header } from "@/components/parts/header";
import { Chart } from "@/components/dashboard/chart";
import { PageWrapper } from "@/components/parts/page-wrapper";
import { getLeadAndErrorCounts } from "@/lib/data/dashboard";
import { notFound } from "next/navigation";
import { getLeads } from "@/lib/data/leads";
import { getEndpoints } from "@/lib/data/endpoints";
import { DataTable } from "@/components/groups/leads/data-table";
import { columns } from "@/components/groups/leads/columns";
import { getUsageForUser } from "@/lib/data/users";
import { Usage } from "@/components/parts/usage";
import { getEntitlement } from "@/lib/forms/entitlements";

const pageData = {
  name: "Dashboard",
  title: "Dashboard",
  description: "Snapshot of your endpoints and leads",
};

export default async function Page() {
  // fetch chart data
  const charts = await getLeadAndErrorCounts();
  const { data: chartData, serverError: chartServerError } = charts || {};

  // fetch leads
  const leads = await getLeads();
  const { data: leadsData, serverError: leadsServerError } = leads || {};

  // fetch endpoints
  const endpoints = await getEndpoints();
  const { data: endpointsData, serverError: endpointsServerError } =
    endpoints || {};

  // fetch number of leads for user this month
  const usage = await getUsageForUser();
  const { data: usageData, serverError: usageServerError } = usage || {};

  // check for errors
  if (
    !leadsData ||
    !endpointsData ||
    !chartData ||
    usageData === null ||
    usageData === undefined ||
    leadsServerError ||
    endpointsServerError ||
    chartServerError ||
    usageServerError
  ) {
    notFound();
  }

  // get the 5 most recent leads
  const recentLeads = leadsData.slice(0, 5);

  // get the lead limit for the user's plan
  const leadLimit = getEntitlement(usageData.plan).monthlyLeads;

  return (
    <>
      <Breadcrumbs pageName={pageData?.name} />
      <PageWrapper>
        <Header title={pageData?.title}>{pageData?.description}</Header>
        <div className="grid grid-cols-3 gap-4">
          <Chart
            chartData={chartData}
            className={`${
              usageData.plan === "enterprise" ? "col-span-3" : "col-span-2"
            }`}
          />
          {leadLimit !== null && (
            <Usage
              totalUsage={leadLimit}
              used={usageData.leadCount}
              plan={usageData.plan}
            />
          )}
          <Links />
        </div>
        <div className="mt-8">
          <h2 className="text-lg mb-4">Recent Leads</h2>
          <DataTable
            columns={columns}
            data={recentLeads}
            endpoints={endpointsData}
          />
        </div>
      </PageWrapper>
    </>
  );
}

const navLinks = [
  {
    name: "Endpoints",
    description: "Create and Manage Router.so Endpoints",
    href: "/endpoints",
  },
  {
    name: "Leads",
    description: "View Lead data and Form Submissions",
    href: "/leads",
  },
  {
    name: "Logs",
    description: "Monitor your API usage and errors",
    href: "/logs",
  },
];

const Links = () => {
  return (
    <>
      {navLinks.map((link) => (
        <Link
          className="bg-background p-4 rounded-lg border hover:bg-accent/75 transition-all"
          key={link.href}
          href={link.href}
        >
          {link.name}
          <p className="text-sm text-gray-500">{link.description}</p>
        </Link>
      ))}
    </>
  );
};
