import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormEditor } from "../components/groups/forms/form-editor";
import { FORM_STARTERS } from "../lib/forms/starters";
import { storeRecoverableFormDraft } from "../lib/forms/recoverable-draft";

const actionMocks = vi.hoisted(() => ({
  saveFormDraft: vi.fn().mockResolvedValue({ data: { revision: 2 } }),
  capture: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/script", () => ({ default: () => null }));
vi.mock("posthog-js", () => ({ default: { capture: actionMocks.capture } }));
vi.mock("sonner", () => ({
  toast: { error: actionMocks.toastError, success: actionMocks.toastSuccess },
}));
vi.mock("../lib/data/forms", () => ({
  addFormOrigin: vi.fn(),
  deleteForm: vi.fn(),
  publishForm: vi.fn(),
  removeFormOrigin: vi.fn(),
  saveFormDraft: actionMocks.saveFormDraft,
  unpublishForm: vi.fn(),
}));

describe("FormEditor draft recovery", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    actionMocks.saveFormDraft.mockClear();
    actionMocks.capture.mockClear();
    actionMocks.toastError.mockClear();
    actionMocks.toastSuccess.mockClear();
    actionMocks.writeText.mockReset();
    actionMocks.writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: actionMocks.writeText },
    });
  });

  it("offers and restores changes preserved by the browser", async () => {
    storeRecoverableFormDraft(window.localStorage, {
      formId: "form_stale",
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
          id: "form_stale",
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

  it("does not restore a local draft based on an older server revision", async () => {
    storeRecoverableFormDraft(window.localStorage, {
      formId: "form_123",
      baseRevision: 1,
      name: "Stale recovered name",
      definition: {
        ...FORM_STARTERS.contact,
        title: "Stale recovered title",
      },
      updatedAt: "2026-09-03T16:00:00.000Z",
    });

    render(
      <FormEditor
        form={{
          id: "form_123",
          publicId: "public_123",
          name: "Newer saved name",
          endpointId: "endpoint_123",
          endpointName: "Saved endpoint",
          endpointSchema: [],
          attachedToExistingEndpoint: false,
          draftDefinition: FORM_STARTERS.contact,
          draftRevision: 2,
          publishedDefinition: null,
          publishedRevision: 0,
          publishedAt: null,
        }}
        origins={[]}
      />
    );

    expect(
      await screen.findByText(/newer draft has already been saved/i)
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Restore changes" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Download recovered copy" })
    ).not.toBeNull();
    expect(actionMocks.saveFormDraft).not.toHaveBeenCalled();
  });

  it("reports a clipboard failure without recording a placement copy", async () => {
    actionMocks.writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    render(
      <FormEditor
        form={{
          id: "form_copy",
          publicId: "public_copy",
          name: "Copy form",
          endpointId: "endpoint_copy",
          endpointName: "Copy endpoint",
          endpointSchema: [],
          attachedToExistingEndpoint: false,
          draftDefinition: FORM_STARTERS.contact,
          draftRevision: 1,
          publishedDefinition: FORM_STARTERS.contact,
          publishedRevision: 1,
          publishedAt: new Date("2026-09-03T16:00:00.000Z"),
        }}
        origins={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy generic embed code" })
    );

    await waitFor(() =>
      expect(actionMocks.toastError).toHaveBeenCalledWith(
        "Could not copy. Select the text and copy it manually."
      )
    );
    expect(actionMocks.capture).not.toHaveBeenCalled();
    expect(actionMocks.toastSuccess).not.toHaveBeenCalledWith("Copied.");
  });
});
