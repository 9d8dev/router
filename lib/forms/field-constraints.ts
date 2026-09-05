import { z } from "zod";

export type StringLengthConstraints = {
  minLength?: number;
  maxLength?: number;
};

export type NumberConstraints = {
  min?: number;
  max?: number;
  step?: number;
};

export function stringSchemaWithLength(
  constraints?: StringLengthConstraints,
  messages: { min?: string; max?: string } = {}
): z.ZodString {
  let schema = z.string();
  if (constraints?.minLength !== undefined) {
    schema = schema.min(constraints.minLength, messages.min);
  }
  if (constraints?.maxLength !== undefined) {
    schema = schema.max(constraints.maxLength, messages.max);
  }
  return schema;
}

export function isNumberStepAligned(
  value: number,
  constraints?: NumberConstraints
): boolean {
  if (constraints?.step === undefined) return true;
  const base = constraints.min ?? 0;
  const steps = (value - base) / constraints.step;
  return Math.abs(steps - Math.round(steps)) <= 1e-9;
}

export function numberSchemaWithConstraints(
  schema: z.ZodNumber,
  constraints?: NumberConstraints,
  stepMessage = "Choose a valid step value."
): z.ZodType<number> {
  let bounded = schema;
  if (constraints?.min !== undefined) bounded = bounded.min(constraints.min);
  if (constraints?.max !== undefined) bounded = bounded.max(constraints.max);
  return bounded.refine(
    (value) => isNumberStepAligned(value, constraints),
    stepMessage
  );
}
