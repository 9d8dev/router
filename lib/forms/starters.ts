import {
  compileEndpointSchema,
  formDefinitionV1Schema,
  type CompiledEndpointField,
  type FormDefinitionV1,
  type FormFieldV1,
} from "./definition";

export type StarterId = "blank" | "contact" | "lead-capture" | "feedback" | "newsletter";

const completion = {
  type: "message" as const,
  message: "Thanks — your response has been received.",
};

export const FORM_STARTERS: Record<StarterId, FormDefinitionV1> = {
  blank: {
    version: 1,
    title: "Untitled form",
    description: "Add fields to start collecting responses.",
    fields: [],
    submitLabel: "Submit",
    completion,
  },
  contact: {
    version: 1,
    title: "Contact us",
    description: "Tell us how we can help.",
    fields: [
      { id: "contact_name", key: "name", kind: "text", label: "Name", required: true },
      { id: "contact_email", key: "email", kind: "email", label: "Email", required: true },
      {
        id: "contact_message",
        key: "message",
        kind: "textarea",
        label: "Message",
        required: true,
        rows: 5,
        validation: { maxLength: 5_000 },
      },
    ],
    submitLabel: "Send message",
    completion,
  },
  "lead-capture": {
    version: 1,
    title: "Get in touch",
    description: "Share a few details and our team will follow up.",
    fields: [
      { id: "lead_name", key: "name", kind: "text", label: "Name", required: true },
      { id: "lead_email", key: "email", kind: "email", label: "Work email", required: true },
      { id: "lead_phone", key: "phone", kind: "phone", label: "Phone", required: false },
      { id: "lead_company", key: "company", kind: "text", label: "Company", required: false },
    ],
    submitLabel: "Request a conversation",
    completion,
  },
  feedback: {
    version: 1,
    title: "Share feedback",
    description: "Help us understand what is working and what could be better.",
    fields: [
      {
        id: "feedback_score",
        key: "score",
        kind: "slider",
        label: "How would you rate your experience?",
        required: true,
        defaultValue: 5,
        validation: { min: 1, max: 10, step: 1 },
      },
      {
        id: "feedback_notes",
        key: "feedback",
        kind: "textarea",
        label: "What should we know?",
        required: false,
        rows: 5,
        validation: { maxLength: 5_000 },
      },
    ],
    submitLabel: "Send feedback",
    completion,
  },
  newsletter: {
    version: 1,
    title: "Stay in the loop",
    description: "Occasional product news. Unsubscribe any time.",
    fields: [
      { id: "newsletter_email", key: "email", kind: "email", label: "Email", required: true },
      {
        id: "newsletter_consent",
        key: "consent",
        kind: "checkbox",
        label: "I agree to receive email updates.",
        required: true,
      },
    ],
    submitLabel: "Subscribe",
    completion,
  },
};

export function getStarter(id: StarterId): FormDefinitionV1 {
  return structuredClone(FORM_STARTERS[id]);
}

type EndpointSeedField = {
  key: string;
  value: string;
  required?: boolean;
  constraints?: CompiledEndpointField["constraints"];
};

const directlyRepresentableEndpointTypes = new Set([
  "email",
  "phone",
  "url",
  "date",
  "number",
  "boolean",
  "string",
  "zip_code",
]);

function hasUsableAllowedValues(field: EndpointSeedField): boolean {
  const values = field.constraints?.allowedValues;
  return Boolean(
    values?.length &&
      values.length <= 100 &&
      new Set(values).size === values.length &&
      values.every((value) => value.trim().length > 0 && value.length <= 120)
  );
}

export function isEndpointSchemaCompatible(schema: EndpointSeedField[]): boolean {
  if (schema.length > 100) return false;
  const keys = new Set<string>();
  return schema.every((field) => {
    if (
      field.key.length > 80 ||
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key) ||
      keys.has(field.key)
    ) {
      return false;
    }
    keys.add(field.key);
    if (field.value === "string_array") return hasUsableAllowedValues(field);
    if (!directlyRepresentableEndpointTypes.has(field.value)) return false;
    if (field.value === "string" && field.constraints?.allowedValues) {
      return hasUsableAllowedValues(field);
    }
    return true;
  });
}

function endpointOptions(
  field: EndpointSeedField,
  fieldId: string
): Array<{ id: string; label: string; value: string }> {
  return field.constraints!.allowedValues!.map((value, optionIndex) => ({
    id: `${fieldId}_option_${optionIndex + 1}`,
    label: value,
    value,
  }));
}

function seedField(
  field: EndpointSeedField,
  index: number,
  id: string,
  key: string,
  label: string
): FormFieldV1 {
  const base = { id, key, label, required: field.required ?? true };
  const constraints = field.constraints;

  if (field.value === "string_array") {
    return {
      ...base,
      kind: "checkbox-group",
      options: endpointOptions(field, id),
      validation: {
        ...(constraints?.minItems !== undefined
          ? { minSelections: constraints.minItems }
          : {}),
        ...(constraints?.maxItems !== undefined
          ? { maxSelections: constraints.maxItems }
          : {}),
      },
    };
  }
  if (field.value === "string" && constraints?.allowedValues) {
    return {
      ...base,
      kind: "select",
      options: endpointOptions(field, id),
    };
  }
  if (field.value === "zip_code") {
    return {
      ...base,
      kind: "text",
      validation: { minLength: 5, maxLength: 5 },
    };
  }
  if (
    field.value === "email" ||
    field.value === "phone" ||
    field.value === "url" ||
    field.value === "string"
  ) {
    const legacyStringMinimum =
      field.value === "string" &&
      field.required === undefined &&
      constraints?.minLength === undefined
        ? 2
        : undefined;
    return {
      ...base,
      kind: field.value === "string" ? "text" : field.value,
      ...(legacyStringMinimum !== undefined ||
      constraints?.minLength !== undefined ||
      constraints?.maxLength !== undefined
        ? {
            validation: {
              ...(legacyStringMinimum !== undefined
                ? { minLength: legacyStringMinimum }
                : constraints?.minLength !== undefined
                ? { minLength: constraints.minLength }
                : {}),
              ...(constraints?.maxLength !== undefined
                ? { maxLength: constraints.maxLength }
                : {}),
            },
          }
        : {}),
    };
  }
  if (field.value === "number") {
    const legacyMinimum =
      field.required === undefined && constraints?.min === undefined ? 0 : undefined;
    return {
      ...base,
      kind: "number",
      validation: {
        ...(typeof constraints?.min === "number"
          ? { min: constraints.min }
          : legacyMinimum !== undefined
            ? { min: legacyMinimum }
            : {}),
        ...(typeof constraints?.max === "number" ? { max: constraints.max } : {}),
        ...(constraints?.step !== undefined ? { step: constraints.step } : {}),
      },
    };
  }
  if (field.value === "date") {
    return {
      ...base,
      kind: "date",
      validation: {
        ...(typeof constraints?.min === "string" ? { min: constraints.min } : {}),
        ...(typeof constraints?.max === "string" ? { max: constraints.max } : {}),
      },
    };
  }
  if (field.value === "boolean") {
    return {
      ...base,
      kind: constraints?.mustBeTrue ? "checkbox" : "yes-no",
    };
  }

  throw new Error(`Endpoint field ${index + 1} cannot be represented by a Router form.`);
}

export function seedDefinitionFromEndpoint(
  name: string,
  schema: EndpointSeedField[]
): FormDefinitionV1 {
  if (!isEndpointSchemaCompatible(schema)) {
    throw new Error("This endpoint schema cannot be represented by a Router form.");
  }
  return {
    version: 1,
    title: name,
    fields: schema.map((field, index) => {
      const id = `imported_field_${index + 1}`;
      const label = field.key
        .replace(/[_-]+/g, " ")
        .replace(/^./, (character) => character.toUpperCase());
      return seedField(field, index, id, field.key, label);
    }),
    submitLabel: "Submit",
    completion,
  } as FormDefinitionV1;
}

export function hasEndpointSchemaChangedFromEndpoint(
  draftInput: unknown,
  endpointSchema: EndpointSeedField[]
): boolean {
  const draft = formDefinitionV1Schema.safeParse(draftInput);
  if (!draft.success || !isEndpointSchemaCompatible(endpointSchema)) return true;
  const baseline = seedDefinitionFromEndpoint("Endpoint", endpointSchema);
  return (
    JSON.stringify(compileEndpointSchema(draft.data)) !==
    JSON.stringify(compileEndpointSchema(baseline))
  );
}
