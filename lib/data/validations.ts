import { z } from "zod";

export const deleteLogSchema = z.object({
  id: z.string(),
});

export const getLeadDataSchema = z.object({
  id: z.string(),
});

const ValidationType = z.enum(
  [
    "phone",
    "email",
    "string",
    "number",
    "date",
    "boolean",
    "url",
    "zip_code",
    "string_array",
  ],
  {
    errorMap: () => ({ message: "Please select a valid field type." }),
  }
);

const endpointConstraintsSchema = z
  .object({
    minLength: z.number().int().min(0).max(10_000).optional(),
    maxLength: z.number().int().min(1).max(10_000).optional(),
    min: z.union([z.number().finite(), z.string().date()]).optional(),
    max: z.union([z.number().finite(), z.string().date()]).optional(),
    step: z.number().positive().finite().optional(),
    allowedValues: z.array(z.string().max(120)).max(100).optional(),
    minItems: z.number().int().min(0).max(100).optional(),
    maxItems: z.number().int().min(1).max(100).optional(),
    mustBeTrue: z.boolean().optional(),
  })
  .superRefine((constraints, context) => {
    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minLength"],
        message: "Minimum length cannot exceed maximum length.",
      });
    }
    if (
      constraints.min !== undefined &&
      constraints.max !== undefined &&
      typeof constraints.min === typeof constraints.max &&
      constraints.min > constraints.max
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min"],
        message: "Minimum cannot exceed maximum.",
      });
    }
    if (
      constraints.minItems !== undefined &&
      constraints.maxItems !== undefined &&
      constraints.minItems > constraints.maxItems
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minItems"],
        message: "Minimum items cannot exceed maximum items.",
      });
    }
  });

const endpointFieldSchema = z.object({
  key: z.string().min(1, { message: "Please enter a valid field name." }),
  value: ValidationType,
  required: z.boolean().optional(),
  constraints: endpointConstraintsSchema.optional(),
});

export const createEndpointFormSchema = z.object({
  name: z.string().min(1, "Not a valid name."),
  schema: z.array(endpointFieldSchema),
  formEnabled: z.boolean(),
  successUrl: z.string().url().optional(),
  failUrl: z.string().url().optional(),
  webhookEnabled: z.boolean(),
  webhook: z.string().url().optional(),
});

export const updateEndpointFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Not a valid name."),
  schema: z.array(endpointFieldSchema),
  formEnabled: z.boolean(),
  successUrl: z.string().url().optional(),
  failUrl: z.string().url().optional(),
  webhookEnabled: z.boolean(),
  webhook: z.string().url().optional(),
});
