import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/stripe", () => ({
  createCustomerPortalSession: vi.fn(),
  postStripeSession: vi.fn(),
}));

import { PlanTiles } from "../app/upgrade/plan-tiles";

describe("plan pricing", () => {
  afterEach(() => cleanup());

  it("keeps Free distinct from custom pricing in annual mode", () => {
    render(
      <PlanTiles
        usage={{
          plan: "free",
          legacyPriceMigrationRequired: false,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          stripeSubscriptionStatus: null,
          stripeBillingInterval: null,
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Annual" }));

    const freeCard = screen.getByRole("heading", { name: "Free" }).closest("article");
    const enterpriseCard = screen
      .getByRole("heading", { name: "Enterprise" })
      .closest("article");
    expect(freeCard?.textContent).toContain("$0");
    expect(freeCard?.textContent).not.toContain("Custom");
    expect(enterpriseCard?.textContent).toContain("Custom");
  });

  it("lets a monthly customer choose the annual price for the same plan", () => {
    render(
      <PlanTiles
        usage={{
          plan: "pro",
          legacyPriceMigrationRequired: false,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          stripeSubscriptionStatus: "active",
          stripeBillingInterval: "monthly",
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Current plan" }).hasAttribute("disabled")
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(
      screen.getByRole("button", { name: "Choose Pro" }).hasAttribute("disabled")
    ).toBe(false);
  });

  it("keeps Enterprise current when the billing toggle changes", () => {
    render(
      <PlanTiles
        usage={{
          plan: "enterprise",
          legacyPriceMigrationRequired: false,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          stripeSubscriptionStatus: "active",
          stripeBillingInterval: null,
        }}
      />
    );

    const enterpriseCard = screen.getByRole("heading", { name: "Enterprise" }).closest("article");
    expect(enterpriseCard?.className).toContain("border-foreground");
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(enterpriseCard?.className).toContain("border-foreground");
  });
});
