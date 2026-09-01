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

export const createEndpointFormSchema = z.object({
  name: z.string().min(1, "Not a valid name."),
  schema: z.array(
    z.object({
      key: z.string().min(1, { message: "Please enter a valid field name." }),
      value: ValidationType,
    })
  ),
  formEnabled: z.boolean(),
  successUrl: z.string().url().optional(),
  failUrl: z.string().url().optional(),
  webhookEnabled: z.boolean(),
  webhook: z.string().url().optional(),
});

export const updateEndpointFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Not a valid name."),
  schema: z.array(
    z.object({
      key: z.string().min(1, { message: "Please enter a valid field name." }),
      value: ValidationType,
    })
  ),
  formEnabled: z.boolean(),
  successUrl: z.string().url().optional(),
  failUrl: z.string().url().optional(),
  webhookEnabled: z.boolean(),
  webhook: z.string().url().optional(),
});
