import { z } from "zod";
import validator from "validator";
import {
  numberSchemaWithConstraints,
  stringSchemaWithLength,
} from "./field-constraints";

const fieldIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "Use a stable alphanumeric field ID.");

const submissionKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Submission keys must start with a letter and contain only letters, numbers, and underscores."
  );

const optionSchema = z.object({
  id: fieldIdSchema,
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
});

const baseFieldShape = {
  id: fieldIdSchema,
  key: submissionKeySchema,
  label: z.string().trim().min(1).max(160),
  helpText: z.string().trim().max(500).optional(),
  required: z.boolean().default(false),
};

const textValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(10_000).optional(),
    maxLength: z.number().int().min(1).max(10_000).optional(),
  })
  .refine(
    (value) =>
      value.minLength === undefined ||
      value.maxLength === undefined ||
      value.minLength <= value.maxLength,
    { message: "Minimum length cannot exceed maximum length." }
  );

const numberValidationSchema = z
  .object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().positive().finite().optional(),
  })
  .refine(
    (value) =>
      value.min === undefined || value.max === undefined || value.min <= value.max,
    { message: "Minimum cannot exceed maximum." }
  );

const dateValidationSchema = z
  .object({
    min: z.string().date().optional(),
    max: z.string().date().optional(),
  })
  .refine(
    (value) =>
      value.min === undefined || value.max === undefined || value.min <= value.max,
    { message: "Minimum date cannot exceed maximum date." }
  );

const stringField = (kind: "text" | "email" | "phone" | "url") =>
  z.object({
    ...baseFieldShape,
    kind: z.literal(kind),
    placeholder: z.string().max(200).optional(),
    defaultValue: z.string().max(10_000).optional(),
    validation: textValidationSchema.optional(),
  });

const textareaField = z.object({
  ...baseFieldShape,
  kind: z.literal("textarea"),
  placeholder: z.string().max(200).optional(),
  defaultValue: z.string().max(10_000).optional(),
  rows: z.number().int().min(2).max(20).optional(),
  validation: textValidationSchema.optional(),
});

const numberField = (kind: "number" | "slider") =>
  z.object({
    ...baseFieldShape,
    kind: z.literal(kind),
    placeholder: z.string().max(200).optional(),
    defaultValue: z.number().finite().optional(),
    validation: numberValidationSchema.optional(),
  });

const dateField = z.object({
  ...baseFieldShape,
  kind: z.literal("date"),
  defaultValue: z.string().date().optional(),
  validation: dateValidationSchema.optional(),
});

const choiceField = (kind: "select" | "radio") =>
  z.object({
    ...baseFieldShape,
    kind: z.literal(kind),
    placeholder: z.string().max(200).optional(),
    defaultValue: z.string().max(120).optional(),
    options: z.array(optionSchema).min(1).max(100),
  });

const checkboxGroupField = z.object({
  ...baseFieldShape,
  kind: z.literal("checkbox-group"),
  defaultValue: z.array(z.string().max(120)).max(100).optional(),
  options: z.array(optionSchema).min(1).max(100),
  validation: z
    .object({
      minSelections: z.number().int().min(0).max(100).optional(),
      maxSelections: z.number().int().min(1).max(100).optional(),
    })
    .refine(
      (value) =>
        value.minSelections === undefined ||
        value.maxSelections === undefined ||
        value.minSelections <= value.maxSelections,
      { message: "Minimum selections cannot exceed maximum selections." }
    )
    .optional(),
});

const booleanField = (kind: "checkbox" | "yes-no" | "switch") =>
  z.object({
    ...baseFieldShape,
    kind: z.literal(kind),
    defaultValue: z.boolean().optional(),
  });

export const formFieldV1Schema = z.discriminatedUnion("kind", [
  stringField("text"),
  stringField("email"),
  stringField("phone"),
  stringField("url"),
  dateField,
  numberField("number"),
  textareaField,
  choiceField("select"),
  choiceField("radio"),
  booleanField("checkbox"),
  checkboxGroupField,
  booleanField("yes-no"),
  booleanField("switch"),
  numberField("slider"),
]);

const completionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    message: z.string().trim().min(1).max(1_000),
  }),
  z.object({
    type: z.literal("redirect"),
    url: z
      .string()
      .url()
      .refine((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }, {
        message: "Redirect URLs must use HTTPS.",
      }),
  }),
]);

export const formDefinitionV1Schema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(600).optional(),
    fields: z.array(formFieldV1Schema).max(100),
    submitLabel: z.string().trim().min(1).max(80),
    completion: completionSchema,
  })
  .superRefine((definition, context) => {
    const ids = new Set<string>();
    const keys = new Set<string>();

    definition.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", index, "id"],
          message: "Field IDs must be unique.",
        });
      }
      if (keys.has(field.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", index, "key"],
          message: "Submission keys must be unique.",
        });
      }
      ids.add(field.id);
      keys.add(field.key);

      if ("options" in field) {
        const optionIds = new Set<string>();
        const optionValues = new Set<string>();
        field.options.forEach((option, optionIndex) => {
          if (optionIds.has(option.id) || optionValues.has(option.value)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["fields", index, "options", optionIndex],
              message: "Option IDs and values must be unique within a field.",
            });
          }
          optionIds.add(option.id);
          optionValues.add(option.value);
        });
      }
    });
  });

const draftOptionSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(120),
  value: z.string().max(120),
});

const draftValidationSchema = z
  .object({
    minLength: z.number().finite().optional(),
    maxLength: z.number().finite().optional(),
    min: z.union([z.number().finite(), z.string().max(100)]).optional(),
    max: z.union([z.number().finite(), z.string().max(100)]).optional(),
    step: z.number().finite().optional(),
    minSelections: z.number().finite().optional(),
    maxSelections: z.number().finite().optional(),
  })
  .optional();

const draftFieldSchema = z
  .object({
    id: z.string().max(80),
    key: z.string().max(80),
    kind: z.enum([
      "text",
      "email",
      "phone",
      "url",
      "date",
      "number",
      "textarea",
      "select",
      "radio",
      "checkbox",
      "checkbox-group",
      "yes-no",
      "switch",
      "slider",
    ]),
    label: z.string().max(160),
    helpText: z.string().max(500).optional(),
    required: z.boolean(),
    placeholder: z.string().max(200).optional(),
    defaultValue: z
      .union([
        z.string().max(10_000),
        z.number().finite(),
        z.boolean(),
        z.array(z.string().max(120)).max(100),
      ])
      .optional(),
    options: z.array(draftOptionSchema).max(100).optional(),
    rows: z.number().finite().optional(),
    validation: draftValidationSchema,
  })
  .superRefine((field, context) => {
    if (
      (field.kind === "select" ||
        field.kind === "radio" ||
        field.kind === "checkbox-group") &&
      !field.options
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Choice fields require options.",
      });
    }
  });

/**
 * Drafts preserve safe editor state even while fields are temporarily incomplete.
 * Publishing always reparses the snapshot with formDefinitionV1Schema.
 */
export const formDraftDefinitionV1Schema = z.object({
  version: z.literal(1),
  title: z.string().max(120),
  description: z.string().max(600).optional(),
  fields: z.array(draftFieldSchema).max(100),
  submitLabel: z.string().max(80),
  completion: z.discriminatedUnion("type", [
    z.object({ type: z.literal("message"), message: z.string().max(1_000) }),
    z.object({ type: z.literal("redirect"), url: z.string().max(2_048) }),
  ]),
});

export type FormDefinitionV1 = z.infer<typeof formDefinitionV1Schema>;
export type FormFieldV1 = z.infer<typeof formFieldV1Schema>;
export type FormCompletionV1 = z.infer<typeof completionSchema>;

export type CompiledEndpointField = {
  key: string;
  value:
    | "phone"
    | "email"
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "url"
    | "zip_code"
    | "string_array";
  required: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    min?: number | string;
    max?: number | string;
    step?: number;
    allowedValues?: string[];
    minItems?: number;
    maxItems?: number;
    mustBeTrue?: boolean;
  };
};

export function compileEndpointSchema(
  input: FormDefinitionV1
): CompiledEndpointField[] {
  const definition = formDefinitionV1Schema.parse(input);

  return definition.fields.map((field): CompiledEndpointField => {
    const base = { key: field.key, required: field.required };

    switch (field.kind) {
      case "email":
      case "phone":
      case "url":
        return {
          ...base,
          value: field.kind,
          ...(field.validation ? { constraints: field.validation } : {}),
        };
      case "text":
      case "textarea":
        return {
          ...base,
          value: "string",
          ...(field.validation ? { constraints: field.validation } : {}),
        };
      case "date":
        return {
          ...base,
          value: "date",
          ...(field.validation ? { constraints: field.validation } : {}),
        };
      case "number":
      case "slider":
        return {
          ...base,
          value: "number",
          ...(field.validation ? { constraints: field.validation } : {}),
        };
      case "select":
      case "radio":
        return {
          ...base,
          value: "string",
          constraints: { allowedValues: field.options.map((option) => option.value) },
        };
      case "checkbox-group":
        return {
          ...base,
          value: "string_array",
          constraints: {
            allowedValues: field.options.map((option) => option.value),
            ...(field.required || field.validation?.minSelections !== undefined
              ? {
                  minItems: field.required
                    ? Math.max(1, field.validation?.minSelections ?? 0)
                    : field.validation!.minSelections,
                }
              : {}),
            ...(field.validation?.maxSelections !== undefined
              ? { maxItems: field.validation.maxSelections }
              : {}),
          },
        };
      case "checkbox":
        return {
          ...base,
          value: "boolean",
          ...(field.required ? { constraints: { mustBeTrue: true } } : {}),
        };
      case "yes-no":
      case "switch":
        return { ...base, value: "boolean" };
    }
  });
}

type FieldErrors = Record<string, string[]>;

export type FormValuesResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: FieldErrors };

function optionalString(schema: z.ZodType<string>, required: boolean) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    required
      ? schema.refine((value) => value.length > 0, "This field is required.")
      : schema.optional()
  );
}

function schemaForField(field: FormFieldV1): z.ZodTypeAny {
  switch (field.kind) {
    case "text":
    case "textarea": {
      const schema = stringSchemaWithLength(field.validation, {
        min: field.validation?.minLength !== undefined
          ? `Enter at least ${field.validation.minLength} characters.`
          : undefined,
        max: field.validation?.maxLength !== undefined
          ? `Enter no more than ${field.validation.maxLength} characters.`
          : undefined,
      });
      return optionalString(schema, field.required);
    }
    case "email":
      return optionalString(
        stringSchemaWithLength(field.validation).email("Enter a valid email address."),
        field.required
      );
    case "phone":
      return optionalString(
        stringSchemaWithLength(field.validation).refine(
          (value) => validator.isMobilePhone(value),
          "Enter a valid phone number."
        ),
        field.required
      );
    case "url":
      return optionalString(
        stringSchemaWithLength(field.validation).url("Enter a valid URL."),
        field.required
      );
    case "date": {
      let schema: z.ZodType<string> = z.string().date("Enter a valid date.");
      if (field.validation?.min) {
        schema = schema.refine((value) => value >= field.validation!.min!, `Choose ${field.validation.min} or later.`);
      }
      if (field.validation?.max) {
        schema = schema.refine((value) => value <= field.validation!.max!, `Choose ${field.validation.max} or earlier.`);
      }
      return optionalString(schema, field.required);
    }
    case "number":
    case "slider": {
      const schema = numberSchemaWithConstraints(
        z.coerce.number().finite("Enter a valid number."),
        field.validation
      );
      return field.required ? schema : z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
    }
    case "select":
    case "radio": {
      const allowed = new Set(field.options.map((option) => option.value));
      const schema = z.string().refine((value) => allowed.has(value), "Choose a valid option.");
      return optionalString(schema, field.required);
    }
    case "checkbox-group": {
      const allowed = new Set(field.options.map((option) => option.value));
      const minimum = field.required ? Math.max(1, field.validation?.minSelections ?? 0) : field.validation?.minSelections;
      let schema = z
        .array(z.string())
        .min(
          minimum ?? 0,
          minimum
            ? `Choose at least ${minimum} option${minimum === 1 ? "" : "s"}.`
            : undefined
        )
        .max(field.validation?.maxSelections ?? field.options.length)
        .refine((values) => values.every((value) => allowed.has(value)), "Choose only valid options.");
      return field.required ? schema : schema.optional();
    }
    case "checkbox":
      return field.required
        ? z.literal(true, { errorMap: () => ({ message: "This field is required." }) })
        : z.boolean().optional();
    case "yes-no":
    case "switch":
      return field.required ? z.boolean() : z.boolean().optional();
  }
}

export function validateFormValues(
  input: FormDefinitionV1,
  values: unknown
): FormValuesResult {
  const definition = formDefinitionV1Schema.parse(input);
  const shape = Object.fromEntries(
    definition.fields.map((field) => [field.key, schemaForField(field)])
  );
  const result = z.object(shape).strict("Unknown field.").safeParse(values);

  if (result.success) return { success: true, data: result.data };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      for (const key of issue.keys) errors[key] = ["Unknown field."];
      continue;
    }
    const key = String(issue.path[0] ?? "form");
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return { success: false, errors };
}
