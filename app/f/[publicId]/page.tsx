import Script from "next/script";
import { notFound } from "next/navigation";
import { getPublishedForm } from "@/lib/data/public-forms";
import { publicFormsEnabled } from "@/lib/forms/feature-flags";

export default async function HostedFormPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!publicFormsEnabled()) notFound();
  const form = await getPublishedForm(publicId);
  if (!form) notFound();

  return (
    <div className="router-hosted-form fixed inset-0 z-50 overflow-y-auto bg-[#f6f6f3] text-[#171714]">
      <main className="mx-auto flex min-h-full w-full max-w-2xl items-center px-5 py-14 sm:px-8">
        <div className="w-full rounded-2xl border border-black/10 bg-white p-6 shadow-[0_20px_70px_rgba(0,0,0,.08)] [--router-form-accent:#171714] [--router-form-accent-contrast:#fff] [--router-form-border-color:rgba(23,23,20,.18)] [--router-form-muted-color:rgba(23,23,20,.62)] [--router-form-surface:#fff] sm:p-10">
          <div data-router-form={publicId} data-router-placement="hosted" />
        </div>
      </main>
      <Script src="/embed/v1.js" strategy="afterInteractive" />
    </div>
  );
}
