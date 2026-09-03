import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormEditor } from "../components/groups/forms/form-editor";
import { FORM_STARTERS } from "../lib/forms/starters";
import { storeRecoverableFormDraft } from "../lib/forms/recoverable-draft";

const actionMocks = vi.hoisted(() => ({
  saveFormDraft: vi.fn().mockResolvedValue({ data: { revision: 2 } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("../lib/data/forms", () => ({
  addFormOrigin: vi.fn(),
  deleteForm: vi.fn(),
  publishForm: vi.fn(),
  removeFormOrigin: vi.fn(),
  saveFormDraft: actionMocks.saveFormDraft,
  unpublishForm: vi.fn(),
}));

describe("FormEditor draft recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    actionMocks.saveFormDraft.mockClear();
  });

  it("offers and restores changes preserved by the browser", async () => {
    storeRecoverableFormDraft(window.localStorage, {
      formId: "form_123",
      baseRevision: 1,
      name: "Recovered form name",
      definition: {
        ...FORM_STARTERS.contact,
        title: "Recovered public title",
      },
      updatedAt: "2026-09-03T16:00:00.000Z",
    });

    render(
      <FormEditor
        form={{
          id: "form_123",
          publicId: "public_123",
          name: "Saved form name",
          endpointId: "endpoint_123",
          endpointName: "Saved endpoint",
          endpointSchema: [],
          attachedToExistingEndpoint: false,
          draftDefinition: FORM_STARTERS.contact,
          draftRevision: 1,
          publishedDefinition: null,
          publishedRevision: 0,
          publishedAt: null,
        }}
        origins={[]}
      />
    );

    expect(
      await screen.findByText("Unsaved changes are available")
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restore changes" }));

    expect(
      (screen.getByLabelText("Internal form name") as HTMLInputElement).value
    ).toBe("Recovered form name");
    await waitFor(() => expect(actionMocks.saveFormDraft).toHaveBeenCalled());
  });
});
