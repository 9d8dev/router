export function legacyMigrationDecision(input: {
  apply: boolean;
  cancelAtPeriodEnd: boolean;
}): { updateStripe: boolean; reconcileRouter: boolean } {
  return {
    updateStripe: input.apply && !input.cancelAtPeriodEnd,
    reconcileRouter: input.apply,
  };
}
