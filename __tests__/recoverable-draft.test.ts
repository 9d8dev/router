import { beforeEach, describe, expect, it } from "vitest";
import { FORM_STARTERS } from "../lib/forms/starters";
import {
  clearRecoverableFormDraft,
  readRecoverableFormDraft,
  storeRecoverableFormDraft,
} from "../lib/forms/recoverable-draft";

describe("recoverable form drafts", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips an unsaved draft for the same form", () => {
    storeRecoverableFormDraft(window.localStorage, {
      formId: "form_123",
      baseRevision: 4,
      name: "Recovered contact form",
      definition: {
        ...FORM_STARTERS.contact,
        title: "Recovered title",
      },
      updatedAt: "2026-09-03T16:00:00.000Z",
    });

    expect(readRecoverableFormDraft(window.localStorage, "form_123")).toEqual(
      expect.objectContaining({
        formId: "form_123",
        baseRevision: 4,
        name: "Recovered contact form",
        definition: expect.objectContaining({ title: "Recovered title" }),
      })
    );

    clearRecoverableFormDraft(window.localStorage, "form_123");
    expect(readRecoverableFormDraft(window.localStorage, "form_123")).toBeNull();
  });

  it("ignores malformed and cross-form recovery records", () => {
    window.localStorage.setItem(
      "router-form-draft:form_123",
      JSON.stringify({ formId: "form_other", definition: {} })
    );

    expect(readRecoverableFormDraft(window.localStorage, "form_123")).toBeNull();
    expect(window.localStorage.getItem("router-form-draft:form_123")).toBeNull();
  });
});
