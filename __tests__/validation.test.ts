import { expect, test, describe } from "vitest";
import * as validation from "../lib/validation";
import { updateEndpointFormSchema } from "../lib/data/validations";
import { endpointSchemaForUpdate } from "../lib/forms/endpoint-schema";

describe("endpoint editor validation", () => {
  test("preserves form-compiled required and constraint metadata", () => {
    const parsed = updateEndpointFormSchema.parse({
      id: "endpoint_1",
      name: "Contact",
      schema: [
        {
          key: "email",
          value: "email",
          required: false,
          constraints: { minLength: 5, maxLength: 120 },
        },
        {
          key: "consent",
          value: "boolean",
          required: true,
          constraints: { mustBeTrue: true },
        },
      ],
      formEnabled: false,
      webhookEnabled: false,
    });

    expect(parsed.schema).toEqual([
      {
        key: "email",
        value: "email",
        required: false,
        constraints: { minLength: 5, maxLength: 120 },
      },
      {
        key: "consent",
        value: "boolean",
        required: true,
        constraints: { mustBeTrue: true },
      },
    ]);
  });

  test("keeps the compiled contract when attached endpoint settings are saved", () => {
    const current = [
      {
        key: "email",
        value: "email" as const,
        required: false,
        constraints: { maxLength: 120 },
      },
    ];

    expect(
      endpointSchemaForUpdate(
        current,
        [{ key: "email", value: "email" }],
        true
      )
    ).toBeUndefined();
    expect(
      endpointSchemaForUpdate(
        current,
        [{ key: "renamed", value: "email" }],
        true
      )
    ).toBeNull();
    expect(
      endpointSchemaForUpdate(
        current,
        [{ key: "renamed", value: "email" }],
        false
      )
    ).toEqual([{ key: "renamed", value: "email" }]);
  });
});

describe("convertToCorrectTypes", () => {
  test('should convert "true" and "false" strings to boolean values', () => {
    const data = { isActive: "true", isVerified: "false" };
    const schema: GeneralSchema[] = [
      { key: "isActive", value: "boolean" },
      { key: "isVerified", value: "boolean" },
    ];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result.isActive).toBe(true);
    expect(result.isVerified).toBe(false);
  });

  test("should convert strings to numbers", () => {
    const data = { age: "30", score: "NaN", invalidNumber: "abc" };
    const schema: GeneralSchema[] = [
      { key: "age", value: "number" },
      { key: "score", value: "number" },
      { key: "invalidNumber", value: "number" },
    ];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result.age).toBe(30);
    expect(result.score).toBe(undefined);
    expect(result.invalidNumber).toBe(undefined);
  });

  test("should not modify strings", () => {
    const data = { name: "John Doe", country: "USA" };
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "country", value: "string" },
    ];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result.name).toBe("John Doe");
    expect(result.country).toBe("USA");
  });

  test("should handle mixed types in data", () => {
    const data = {
      name: "Jane Doe",
      isActive: "true",
      age: "28",
      invalidNumber: "not a number",
    };
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "isActive", value: "boolean" },
      { key: "age", value: "number" },
      { key: "invalidNumber", value: "number" },
    ];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result.name).toBe("Jane Doe");
    expect(result.isActive).toBe(true);
    expect(result.age).toBe(28);
    expect(result.invalidNumber).toBe(undefined);
  });

  test("should return empty object when schema is empty", () => {
    const data = { name: "Jane Doe", isActive: "true", age: "28" };
    const schema: GeneralSchema[] = [];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result).toEqual({});
  });

  test("should return an object with undefined values if keys are missing in data", () => {
    const data = { name: "Jane Doe" };
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "isActive", value: "boolean" },
      { key: "age", value: "number" },
    ];

    const result = validation.convertToCorrectTypes(data, schema);

    expect(result.name).toBe("Jane Doe");
    expect(result.isActive).toBe(false);
    expect(result.age).toBe(undefined);
  });
});

describe("generateDynamicSchema", () => {
  test("should generate a dynamic schema for a single field", () => {
    const schema: GeneralSchema[] = [{ key: "age", value: "number" }];

    const dynamicSchema = validation.generateDynamicSchema(schema);

    const expectedSchema = {
      age: validation.validations.number,
    };

    expect(dynamicSchema).toEqual(expectedSchema);
  });

  test("should generate a dynamic schema for multiple fields", () => {
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "email", value: "email" },
      { key: "age", value: "number" },
    ];

    const dynamicSchema = validation.generateDynamicSchema(schema);

    const expectedSchema = {
      name: validation.validations.string,
      email: validation.validations.email,
      age: validation.validations.number,
    };

    expect(dynamicSchema).toEqual(expectedSchema);
  });

  test("should handle an empty schema array", () => {
    // @ts-expect-error -> we normally won't pass in an empty schema, but just in case :)
    const schema = [];

    // @ts-expect-error -> we normally won't pass in an empty schema, but just in case :)
    const dynamicSchema = validation.generateDynamicSchema(schema);

    const expectedSchema = {};

    expect(dynamicSchema).toEqual(expectedSchema);
  });

  test("should ignore invalid validation types and not include them in the schema", () => {
    const schema: GeneralSchema[] = [
      { key: "username", value: "string" },
      { key: "invalidField", value: "unknown" as ValidationType },
    ];

    const dynamicSchema = validation.generateDynamicSchema(schema);

    const expectedSchema = {
      username: validation.validations.string,
    };

    expect(dynamicSchema).toEqual(expectedSchema);
    expect(dynamicSchema).not.toHaveProperty("invalidField");
  });

  test("should correctly map a variety of validation types", () => {
    const schema: GeneralSchema[] = [
      { key: "isActive", value: "boolean" },
      { key: "birthdate", value: "date" },
      { key: "website", value: "url" },
      { key: "postalCode", value: "zip_code" },
    ];

    const dynamicSchema = validation.generateDynamicSchema(schema);

    const expectedSchema = {
      isActive: validation.validations.boolean,
      birthdate: validation.validations.date,
      website: validation.validations.url,
      postalCode: validation.validations.zip_code,
    };

    expect(dynamicSchema).toEqual(expectedSchema);
  });
});

describe("validateAndParseData", () => {
  test("should successfully validate and parse valid data", () => {
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "age", value: "number" },
      { key: "email", value: "email" },
    ];
    const dynamicSchema = validation.generateDynamicSchema(schema);
    const validData = {
      name: "John Doe",
      age: 30,
      email: "john@example.com",
    };

    const result = validation.validateAndParseData(dynamicSchema, validData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validData);
    }
  });

  test("should return error for invalid data", () => {
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "age", value: "number" },
      { key: "email", value: "email" },
    ];
    const dynamicSchema = validation.generateDynamicSchema(schema);
    const invalidData = {
      name: "John Doe",
      age: "thirty", // should be a number
      email: "invalid-email", // invalid email format
    };

    const result = validation.validateAndParseData(dynamicSchema, invalidData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(2);
      expect(result.error.issues[0].path).toEqual(["age"]);
      expect(result.error.issues[1].path).toEqual(["email"]);
    }
  });

  test("should handle missing required fields", () => {
    const schema: GeneralSchema[] = [
      { key: "name", value: "string" },
      { key: "age", value: "number" },
    ];
    const dynamicSchema = validation.generateDynamicSchema(schema);
    const incompleteData = {
      name: "John Doe",
      // age is missing
    };

    const result = validation.validateAndParseData(
      dynamicSchema,
      incompleteData
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].path).toEqual(["age"]);
    }
  });

  test("should ignore extra fields not in the schema", () => {
    const schema: GeneralSchema[] = [{ key: "name", value: "string" }];
    const dynamicSchema = validation.generateDynamicSchema(schema);
    const dataWithExtraFields = {
      name: "John Doe",
      extraField: "This should be ignored",
    };

    const result = validation.validateAndParseData(
      dynamicSchema,
      dataWithExtraFields
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "John Doe" });
      expect(result.data).not.toHaveProperty("extraField");
    }
  });
});
