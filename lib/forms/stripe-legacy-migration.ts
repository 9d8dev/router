export function legacyMigrationDecision(input: {
  apply: boolean;
  cancelAtPeriodEnd: boolean;
}): { updateStripe: boolean; reconcileRouter: boolean } {
  return {
    updateStripe: input.apply && !input.cancelAtPeriodEnd,
    reconcileRouter: input.apply,
  };
}

export function shouldMigrateLegacySubscriptionStatus(status: string): boolean {
  return ["active", "trialing", "past_due", "unpaid", "paused"].includes(
    status
  );
}

export type LegacySubscriptionMigrationResult<TSubscription> = {
  outcome: "dry-run" | "superseded" | "reconciled";
  subscription: TSubscription;
  updatedStripe: boolean;
};

export async function executeLegacySubscriptionMigration<
  TSubscription,
  TOwner,
>(
  input: {
    apply: boolean;
    cancelAtPeriodEnd: boolean;
    subscription: TSubscription;
  },
  dependencies: {
    preflight: (subscription: TSubscription) => Promise<TOwner | null>;
    scheduleCancellation: (
      subscription: TSubscription
    ) => Promise<TSubscription>;
    reconcile: (
      owner: TOwner,
      subscription: TSubscription
    ) => Promise<void>;
  }
): Promise<LegacySubscriptionMigrationResult<TSubscription>> {
  const decision = legacyMigrationDecision(input);
  if (!decision.reconcileRouter) {
    return {
      outcome: "dry-run",
      subscription: input.subscription,
      updatedStripe: false,
    };
  }

  const owner = await dependencies.preflight(input.subscription);
  if (!owner) {
    return {
      outcome: "superseded",
      subscription: input.subscription,
      updatedStripe: false,
    };
  }

  const subscription = decision.updateStripe
    ? await dependencies.scheduleCancellation(input.subscription)
    : input.subscription;
  await dependencies.reconcile(owner, subscription);
  return {
    outcome: "reconciled",
    subscription,
    updatedStripe: decision.updateStripe,
  };
}
