import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/stripe", () => ({
  createCustomerPortalSession: vi.fn(),
  postStripeSession: vi.fn(),
}));

import { PlanTiles } from "../app/upgrade/plan-tiles";

describe("plan pricing", () => {
  it("keeps Free distinct from custom pricing in annual mode", () => {
    render(
      <PlanTiles
        usage={{
          plan: "free",
          legacyPriceMigrationRequired: false,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          stripeSubscriptionStatus: null,
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
});
