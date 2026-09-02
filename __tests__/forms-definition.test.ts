import { describe, expect, it } from "vitest";
import {
  compileEndpointSchema,
  formDraftDefinitionV1Schema,
  formDefinitionV1Schema,
  validateFormValues,
} from "../lib/forms/definition";
import { validateEndpointValues } from "../lib/forms/endpoint-schema";
import {
  isEndpointSchemaCompatible,
  seedDefinitionFromEndpoint,
} from "../lib/forms/starters";
import { allocateSubmissionKey } from "../lib/forms/field-identity";

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

  it("stores structurally valid incomplete drafts without making them publishable", () => {
    const incomplete = {
      ...contactForm,
      title: "",
      submitLabel: "",
      completion: { type: "redirect" as const, url: "https://" },
      fields: [
        {
          ...contactForm.fields[0],
          key: "",
          validation: { minLength: 10, maxLength: 2 },
        },
      ],
    };

    expect(formDraftDefinitionV1Schema.safeParse(incomplete).success).toBe(true);
    expect(formDefinitionV1Schema.safeParse(incomplete).success).toBe(false);
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

  it("rejects endpoint attachments that cannot be represented without contract drift", () => {
    const unsupported = [{ key: "tags", value: "string_array" }];

    expect(isEndpointSchemaCompatible(unsupported)).toBe(false);
    expect(
      isEndpointSchemaCompatible([{ key: "full name", value: "string" }])
    ).toBe(false);
    expect(() => seedDefinitionFromEndpoint("Tags", unsupported)).toThrow(
      "cannot be represented"
    );
  });

  it("preserves supported legacy constraints when seeding an attached form", () => {
    const seeded = seedDefinitionFromEndpoint("Qualified lead", [
      { key: "name", value: "string" },
      { key: "postal_code", value: "zip_code", required: true },
      {
        key: "interests",
        value: "string_array",
        required: true,
        constraints: {
          allowedValues: ["sales", "support"],
          minItems: 1,
          maxItems: 2,
        },
      },
    ]);

    expect(seeded.fields).toMatchObject([
      { kind: "text", validation: { minLength: 2 } },
      { kind: "text", validation: { minLength: 5, maxLength: 5 } },
      {
        kind: "checkbox-group",
        options: [{ value: "sales" }, { value: "support" }],
        validation: { minSelections: 1, maxSelections: 2 },
      },
    ]);
  });

  it("preserves required checkbox semantics in the compiled endpoint schema", () => {
    const definition = formDefinitionV1Schema.parse({
      ...contactForm,
      fields: [
        {
          id: "fld_consent",
          key: "consent",
          kind: "checkbox",
          label: "I consent",
          required: true,
        },
        {
          id: "fld_topics",
          key: "topics",
          kind: "checkbox-group",
          label: "Topics",
          required: true,
          options: [{ id: "opt_sales", label: "Sales", value: "sales" }],
        },
      ],
    });
    const compiled = compileEndpointSchema(definition);

    expect(compiled).toEqual([
      {
        key: "consent",
        value: "boolean",
        required: true,
        constraints: { mustBeTrue: true },
      },
      {
        key: "topics",
        value: "string_array",
        required: true,
        constraints: { allowedValues: ["sales"], minItems: 1 },
      },
    ]);
    expect(
      validateEndpointValues(compiled, { consent: false, topics: [] })
    ).toMatchObject({ success: false });
  });

  it("retains the nonnegative legacy number contract when reading and attaching", () => {
    const legacyNumber = [{ key: "amount", value: "number" as const }];

    expect(validateEndpointValues(legacyNumber, { amount: -1 })).toMatchObject({
      success: false,
    });
    expect(seedDefinitionFromEndpoint("Payment", legacyNumber).fields[0]).toMatchObject({
      kind: "number",
      validation: { min: 0 },
    });
  });

  it("allocates a submission key that remains unique after field deletion", () => {
    expect(allocateSubmissionKey("Text", ["text_1", "text_3"])).toBe("text_2");
    expect(allocateSubmissionKey("Text", ["text_1", "text_2", "text_3"])).toBe(
      "text_4"
    );
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

  it("enforces every authored string and number constraint", () => {
    const constrainedForm = formDefinitionV1Schema.parse({
      ...contactForm,
      fields: [
        {
          id: "fld_email",
          key: "email",
          kind: "email",
          label: "Email",
          required: true,
          validation: { minLength: 18, maxLength: 30 },
        },
        {
          id: "fld_score",
          key: "score",
          kind: "number",
          label: "Score",
          required: true,
          validation: { min: 1, max: 10, step: 2 },
        },
        {
          id: "fld_phone",
          key: "phone",
          kind: "phone",
          label: "Phone",
          required: true,
          validation: { minLength: 20 },
        },
        {
          id: "fld_url",
          key: "url",
          kind: "url",
          label: "URL",
          required: true,
          validation: { maxLength: 10 },
        },
      ],
    });

    expect(
      validateFormValues(constrainedForm, {
        email: "a@example.com",
        score: 2,
        phone: "+12025550123",
        url: "https://example.com",
      })
    ).toMatchObject({
      success: false,
      errors: {
        email: expect.any(Array),
        score: expect.any(Array),
        phone: expect.any(Array),
        url: expect.any(Array),
      },
    });

    expect(
      validateEndpointValues(compileEndpointSchema(constrainedForm), {
        email: "a@example.com",
        score: 2,
        phone: "+12025550123",
        url: "https://example.com",
      })
    ).toMatchObject({
      success: false,
      errors: {
        email: expect.any(Array),
        score: expect.any(Array),
        phone: expect.any(Array),
        url: expect.any(Array),
      },
    });
  });
});
