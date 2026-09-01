import { z } from "zod";
import validator from "validator";
import type { CompiledEndpointField } from "./definition";

export type LegacyEndpointField = {
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
  required?: boolean;
};

export type CompatibleEndpointField = CompiledEndpointField | LegacyEndpointField;

export type EndpointValuesResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: Record<string, string[]> };

function isLegacyField(field: CompatibleEndpointField): boolean {
  return !("required" in field) || field.required === undefined;
}

function fieldSchema(field: CompatibleEndpointField): z.ZodTypeAny {
  const required = isLegacyField(field) ? true : field.required;
  const constraints = "constraints" in field ? field.constraints : undefined;
  let schema: z.ZodTypeAny;

  switch (field.value) {
    case "email":
      schema = z.string().email("Not a valid email.");
      break;
    case "phone":
      schema = z
        .string()
        .refine((value) => validator.isMobilePhone(value), "Not a valid phone number.");
      break;
    case "url":
      schema = z.string().url("Not a valid URL.");
      break;
    case "zip_code":
      schema = z.string().length(5, "Not a valid zip code.");
      break;
    case "date": {
      let dateSchema: z.ZodType<string> = z.string().date("Not a valid date.");
      if (typeof constraints?.min === "string") {
        dateSchema = dateSchema.refine((value) => value >= constraints.min!, "Date is too early.");
      }
      if (typeof constraints?.max === "string") {
        dateSchema = dateSchema.refine((value) => value <= constraints.max!, "Date is too late.");
      }
      schema = dateSchema;
      break;
    }
    case "number": {
      let numberSchema = z.number().finite();
      if (typeof constraints?.min === "number") numberSchema = numberSchema.min(constraints.min);
      if (typeof constraints?.max === "number") numberSchema = numberSchema.max(constraints.max);
      schema = numberSchema;
      break;
    }
    case "boolean":
      schema = z.boolean();
      break;
    case "string_array": {
      let arraySchema = z.array(z.string());
      if (constraints?.minItems !== undefined) arraySchema = arraySchema.min(constraints.minItems);
      if (constraints?.maxItems !== undefined) arraySchema = arraySchema.max(constraints.maxItems);
      schema = constraints?.allowedValues
        ? arraySchema.refine(
            (values) => values.every((value) => constraints.allowedValues!.includes(value)),
            "Contains an invalid option."
          )
        : arraySchema;
      break;
    }
    case "string":
    default: {
      let stringSchema = z.string();
      if (constraints?.minLength !== undefined) stringSchema = stringSchema.min(constraints.minLength);
      else if (isLegacyField(field)) stringSchema = stringSchema.min(2, "Not a valid string.");
      if (constraints?.maxLength !== undefined) stringSchema = stringSchema.max(constraints.maxLength);
      if (constraints?.allowedValues) {
        schema = stringSchema.refine(
          (value) => constraints.allowedValues!.includes(value),
          "Choose a valid option."
        );
      } else {
        schema = stringSchema;
      }
    }
  }

  return required ? schema : schema.optional();
}

export function validateEndpointValues(
  schema: CompatibleEndpointField[],
  values: unknown,
  options: { rejectUnknown?: boolean } = {}
): EndpointValuesResult {
  const shape = Object.fromEntries(
    schema.map((field) => [field.key, fieldSchema(field)])
  );
  const objectSchema = options.rejectUnknown
    ? z.object(shape).strict("Unknown field.")
    : z.object(shape);
  const result = objectSchema.safeParse(values);

  if (result.success) return { success: true, data: result.data };

  const errors: Record<string, string[]> = {};
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
