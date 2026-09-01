import { describe, expect, it } from "vitest";
import {
  compileEndpointSchema,
  formDefinitionV1Schema,
  validateFormValues,
} from "../lib/forms/definition";

const contactForm = {
  version: 1 as const,
  title: "Contact us",
  description: "We usually reply within one business day.",
  fields: [
    {
      id: "fld_name",
      key: "name",
      kind: "text" as const,
      label: "Name",
      required: true,
      validation: { minLength: 2, maxLength: 80 },
    },
    {
      id: "fld_email",
      key: "email",
      kind: "email" as const,
      label: "Email",
      required: true,
    },
    {
      id: "fld_topics",
      key: "topics",
      kind: "checkbox-group" as const,
      label: "Topics",
      required: false,
      options: [
        { id: "opt_sales", label: "Sales", value: "sales" },
        { id: "opt_support", label: "Support", value: "support" },
      ],
      validation: { minSelections: 1, maxSelections: 2 },
    },
  ],
  submitLabel: "Send",
  completion: { type: "message" as const, message: "Thanks — we’ll be in touch." },
};

describe("FormDefinitionV1", () => {
  it("parses a complete versioned definition", () => {
    expect(formDefinitionV1Schema.parse(contactForm)).toEqual(contactForm);
  });

  it("rejects duplicate stable field ids and submission keys", () => {
    const duplicate = {
      ...contactForm,
      fields: [contactForm.fields[0], { ...contactForm.fields[1], id: "fld_name", key: "name" }],
    };

    const result = formDefinitionV1Schema.safeParse(duplicate);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Field IDs must be unique.", "Submission keys must be unique."])
    );
  });

  it("only allows validated HTTPS completion redirects", () => {
    const result = formDefinitionV1Schema.safeParse({
      ...contactForm,
      completion: { type: "redirect", url: "http://example.com/thanks" },
    });

    expect(result.success).toBe(false);
  });

  it("compiles fields into Router's endpoint schema", () => {
    expect(compileEndpointSchema(contactForm)).toEqual([
      {
        key: "name",
        value: "string",
        required: true,
        constraints: { minLength: 2, maxLength: 80 },
      },
      { key: "email", value: "email", required: true },
      {
        key: "topics",
        value: "string_array",
        required: false,
        constraints: {
          allowedValues: ["sales", "support"],
          minItems: 1,
          maxItems: 2,
        },
      },
    ]);
  });
});

describe("validateFormValues", () => {
  it("normalizes valid values without leaking unknown fields", () => {
    const result = validateFormValues(contactForm, {
      name: "  Ada Lovelace  ",
      email: "ada@example.com",
      topics: ["sales"],
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        topics: ["sales"],
      },
    });
  });

  it("returns structured field errors and rejects unknown fields", () => {
    const result = validateFormValues(contactForm, {
      name: "A",
      email: "not-an-email",
      topics: ["not-an-option"],
      endpointToken: "must-not-pass-through",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toMatchObject({
        name: expect.any(Array),
        email: expect.any(Array),
        topics: expect.any(Array),
        endpointToken: ["Unknown field."],
      });
    }
  });
});
