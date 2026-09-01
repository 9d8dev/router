import type { FormDefinitionV1 } from "./definition";

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

export function seedDefinitionFromEndpoint(
  name: string,
  schema: Array<{ key: string; value: string; required?: boolean }>
): FormDefinitionV1 {
  const usedKeys = new Set<string>();
  return {
    version: 1,
    title: name,
    fields: schema.map((field, index) => {
      const cleaned = field.key.replace(/[^A-Za-z0-9_]/g, "_");
      const baseKey = /^[A-Za-z]/.test(cleaned)
        ? cleaned
        : `field_${cleaned || index + 1}`;
      let key = baseKey;
      let suffix = 2;
      while (usedKeys.has(key)) key = `${baseKey}_${suffix++}`;
      usedKeys.add(key);
      return {
        id: `imported_${index}_${baseKey}`,
        key,
        kind:
          field.value === "email" ||
          field.value === "phone" ||
          field.value === "url" ||
          field.value === "date" ||
          field.value === "number"
            ? field.value
            : field.value === "boolean"
              ? "yes-no"
              : "text",
        label: field.key
          .replace(/[_-]+/g, " ")
          .replace(/^./, (character) => character.toUpperCase()),
        required: field.required ?? true,
      };
    }),
    submitLabel: "Submit",
    completion,
  } as FormDefinitionV1;
}
