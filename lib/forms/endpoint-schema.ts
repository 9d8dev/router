import { z } from "zod";
import validator from "validator";
import type { CompiledEndpointField } from "./definition";
import {
  numberSchemaWithConstraints,
  stringSchemaWithLength,
} from "./field-constraints";

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

export function endpointSchemaForUpdate(
  current: CompatibleEndpointField[],
  requested: CompatibleEndpointField[],
  hasAttachedForm: boolean
): CompatibleEndpointField[] | null | undefined {
  if (!hasAttachedForm) return requested;
  const currentShape = current.map(({ key, value }) => ({ key, value }));
  const requestedShape = requested.map(({ key, value }) => ({ key, value }));
  return JSON.stringify(currentShape) === JSON.stringify(requestedShape)
    ? undefined
    : null;
}

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
      schema = stringSchemaWithLength(constraints).email("Not a valid email.");
      break;
    case "phone":
      schema = stringSchemaWithLength(constraints)
        .refine((value) => validator.isMobilePhone(value), "Not a valid phone number.");
      break;
    case "url":
      schema = stringSchemaWithLength(constraints).url("Not a valid URL.");
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
      schema = numberSchemaWithConstraints(z.number().finite(), {
        min:
          typeof constraints?.min === "number"
            ? constraints.min
            : isLegacyField(field)
              ? 0
              : undefined,
        max: typeof constraints?.max === "number" ? constraints.max : undefined,
        step: constraints?.step,
      });
      break;
    }
    case "boolean":
      schema = constraints?.mustBeTrue
        ? z.literal(true, {
            errorMap: () => ({ message: "This field must be accepted." }),
          })
        : z.boolean();
      break;
    case "string_array": {
      let arraySchema = z.array(z.string());
      if (constraints?.minItems !== undefined) arraySchema = arraySchema.min(constraints.minItems);
      if (constraints?.maxItems !== undefined) arraySchema = arraySchema.max(constraints.maxItems);
      const uniqueSchema = arraySchema.refine(
        (values) => new Set(values).size === values.length,
        "Contains duplicate options."
      );
      schema = constraints?.allowedValues
        ? uniqueSchema.refine(
            (values) => values.every((value) => constraints.allowedValues!.includes(value)),
            "Contains an invalid option."
          )
        : uniqueSchema;
      break;
    }
    case "string":
    default: {
      const stringSchema = stringSchemaWithLength(
        constraints?.minLength === undefined && isLegacyField(field)
          ? { ...constraints, minLength: 2 }
          : constraints,
        { min: isLegacyField(field) ? "Not a valid string." : undefined }
      );
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

  const errors: Record<string, string[]> = Object.create(null);
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
