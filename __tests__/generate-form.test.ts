import { describe, expect, it } from "vitest";
import { generateShadcnForm } from "../lib/helpers/generate-form";

describe("generated endpoint form", () => {
  it("emits valid Zod contracts for optional, boolean, and string-array fields", () => {
    const source = generateShadcnForm([
      { key: "nickname", value: "string", required: false },
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
        constraints: {
          allowedValues: ["sales", "support", "billing"],
          minItems: 2,
          maxItems: 3,
        },
      },
    ]);

    expect(source).toContain("nickname: z.string().optional()");
    expect(source).toContain(
      "consent: z.boolean().refine((value) => value, { message: 'This field is required' })"
    );
    expect(source).toContain(
      "topics: z.array(z.string()).min(2, { message: 'Select at least 2 options' }).max(3)"
    );
    expect(source).not.toContain("z.boolean().min(");
    expect(source).toContain(
      '["sales","support","billing"].map((option) =>'
    );
    expect(source).not.toContain('type="string_array"');
  });
});
