"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  createCustomerPortalSession,
  postStripeSession,
} from "@/lib/data/stripe";
import { ENTITLEMENTS, type RouterPlan } from "@/lib/forms/entitlements";

type Usage = {
  plan: RouterPlan;
  legacyPriceMigrationRequired: boolean;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeSubscriptionStatus: string | null;
};

const plans = [
  {
    id: "free" as const,
    name: "Free",
    description: "Publish forms and endpoints at no cost.",
    features: ["100 leads / month", "Unlimited forms and endpoints", "Hosted, embed, and WordPress", "Webhooks", "Powered by Router badge"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    description: "For growing sites and lead programs.",
    features: ["10,000 leads / month", "Unlimited forms and endpoints", "Hosted, embed, and WordPress", "Unlimited WordPress connections", "No Router attribution"],
  },
  {
    id: "business" as const,
    name: "Business",
    description: "Higher-volume routing for established teams.",
    features: ["50,000 leads / month", "Unlimited forms and endpoints", "Hosted, embed, and WordPress", "Unlimited WordPress connections", "No Router attribution"],
  },
  {
    id: "enterprise" as const,
    name: "Enterprise",
    description: "Contract-defined volume and support.",
    features: ["Contract-defined lead allowance", "Unlimited forms and endpoints", "All publishing surfaces", "Webhooks and WordPress", "No Router attribution"],
  },
];

export function PlanTiles({ usage }: { usage: Usage }) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [working, setWorking] = useState<string | null>(null);

  async function checkout(plan: "pro" | "business") {
    setWorking(plan);
    const result = await postStripeSession({ plan, interval });
    setWorking(null);
    if (result?.serverError) toast.error(result.serverError);
  }

  return (
    <section className="grid gap-8">
      {usage.legacyPriceMigrationRequired && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Choose a current Router plan</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Your legacy entitlement remains active through its current billing period
                {usage.stripeCurrentPeriodEnd
                  ? ` ending ${usage.stripeCurrentPeriodEnd.toLocaleDateString()}`
                  : ""}.
                {usage.stripeCancelAtPeriodEnd
                  ? " Stripe is set to cancel it at period end; purchase Pro or Business to continue above Free limits."
                  : " Period-end cancellation has not been confirmed in Stripe yet."}
              </p>
            </div>
            <Badge variant="outline">Legacy {usage.plan}</Badge>
          </div>
        </div>
      )}

      <div className="mx-auto flex rounded-lg border bg-background p-1">
        <Button size="sm" variant={interval === "monthly" ? "default" : "ghost"} onClick={() => setInterval("monthly")}>Monthly</Button>
        <Button size="sm" variant={interval === "annual" ? "default" : "ghost"} onClick={() => setInterval("annual")}>Annual</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {plans.map((plan) => {
          const entitlement = ENTITLEMENTS[plan.id];
          const isCurrent = usage.plan === plan.id && !usage.legacyPriceMigrationRequired;
          const price = interval === "annual" ? entitlement.annualPrice : entitlement.monthlyPrice;
          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col gap-4 rounded-xl border bg-background p-6",
                isCurrent && "border-foreground ring-2 ring-foreground/10"
              )}
            >
              {isCurrent && <Badge className="absolute -top-3 left-5">Current</Badge>}
              <div><h3 className="text-xl font-semibold">{plan.name}</h3><p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p></div>
              <div>
                {price === null ? (
                  <p className="text-2xl font-semibold">Custom</p>
                ) : (
                  <p className="text-3xl font-semibold">${price}<span className="text-sm font-normal text-muted-foreground">/{interval === "annual" ? "year" : "month"}</span></p>
                )}
                {interval === "annual" && entitlement.annualPrice !== null && entitlement.monthlyPrice !== null && (
                  <p className="text-xs text-muted-foreground">Same monthly lead allowance · save ${entitlement.monthlyPrice * 12 - entitlement.annualPrice}</p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                {plan.features.map((feature) => <p key={feature} className="flex gap-2 text-sm"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {feature}</p>)}
              </div>
              {plan.id === "pro" || plan.id === "business" ? (
                <Button disabled={isCurrent || working !== null} onClick={() => checkout(plan.id)}>
                  {isCurrent ? "Current plan" : working === plan.id ? "Opening checkout…" : `Choose ${plan.name}`}
                </Button>
              ) : plan.id === "enterprise" ? (
                <Button variant="outline" asChild><a href="mailto:info@router.so?subject=Router%20Enterprise">Contact sales <ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>
              ) : (
                <Button variant="outline" disabled={isCurrent}>{isCurrent ? "Current plan" : "Included by default"}</Button>
              )}
            </article>
          );
        })}
      </div>

      {usage.stripeSubscriptionStatus && (
        <div className="text-center text-sm text-muted-foreground">
          Subscription status: {usage.stripeSubscriptionStatus}.{" "}
          <button className="underline underline-offset-4" onClick={async () => {
            const result = await createCustomerPortalSession();
            if (result?.serverError) toast.error(result.serverError);
          }}>Manage billing</button>
        </div>
      )}
    </section>
  );
}
