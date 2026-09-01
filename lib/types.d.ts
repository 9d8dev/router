/**
 * Prop type for navigation
 */
type NavLinkProps = {
  href: string;
  children: React.ReactNode;
  icon: Icon;
};

/**
 * Prop type for header
 */
type HeaderProps = {
  title: string;
  children?: React.ReactNode;
};

/**
 * Represents a general schema.
 *
 * An array of objects, each containing a key and its corresponding ValidationType.
 */
type GeneralSchema = {
  key: string;
  value: ValidationType;
  required?: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    min?: number | string;
    max?: number | string;
    step?: number;
    allowedValues?: string[];
    minItems?: number;
    maxItems?: number;
  };
};

/**
 * Validation types
 *
 * These can be extended
 * * See instructions in @/lib/validation/index.ts
 */
type ValidationType =
  | "phone"
  | "email"
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "url"
  | "zip_code"
  | "string_array";

/**
 * Row type for the main dashboard data on /dashboard route
 */
type LeadAndErrorCountResults = {
  date: string;
  leads: number;
  errors: number;
}[];

/**
 * Represents a mapping between keys of type `GeneralSchema["key"]`
 * and the return types of the corresponding validation functions
 * from the `validations` object.
 */
type SchemaToZodMap = {
  [P in GeneralSchema["key"]]: ReturnType<
    (typeof validations)[GeneralSchema["value"]]
  >;
};

/**
 * Type for fetched logs
 *
 * includes attributes of the 'endpoint' db model
 */
type LogRow = {
  id: string;
  type: "success" | "error";
  message: Record<string, any> | unknown;
  endpoint: string;
  endpointId: string;
  createdAt: Date;
};

/**
 * Type for fetched leads
 *
 * includes attributes of the 'endpoint' db model
 */
type LeadRow = {
  id: string;
  data: { [key: string]: any };
  schema?: { key: string; value: ValidationType }[];
  createdAt: Date;
  updatedAt: Date;
  endpointId: string;
  endpoint?: string;
  formId: string | null;
  formRevision: number | null;
  placement: "headless" | "legacy_html" | "hosted" | "embed" | "wordpress" | null;
};

/**
 * Represents a log message.
 *
 * This type can have two possible shapes:
 * - If the log message is successfully parsed, it will have a shape defined by the `SafeParseReturnType` type.
 * - If the log message is not successfully parsed, it will have a shape of `{ success: string }`.
 */
type LogMessage =
  | z.SafeParseReturnType<
      {
        [x: string]: any;
      },
      {
        [x: string]: any;
      }
    >
  | { success: string };

/**
 * Represents a function that handles server actions.
 *
 * @param formData - The form data to be processed by the server action.
 * @returns A promise that resolves to an object containing an error message, or undefined if there is no error.
 */
type ServerActionFunction = (
  formData: FormData
) => Promise<{ error: string } | undefined>;

type LogPostType = "http" | "form" | "webhook" | "email";
