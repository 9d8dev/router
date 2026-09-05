import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConnection: vi.fn(),
  revokeConnection: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/lib/data/wordpress", () => ({
  createWordPressConnection: mocks.createConnection,
  revokeWordPressConnection: mocks.revokeConnection,
}));

import { WordPressConnections } from "../components/groups/forms/wordpress-connections";

describe("WordPress connection token", () => {
  beforeEach(() => {
    mocks.createConnection.mockReset();
    mocks.createConnection.mockResolvedValue({
      data: {
        id: "connection_1",
        token: "router_wp_secret",
        tokenPrefix: "secret",
        siteOrigin: "https://example.com",
      },
    });
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  afterEach(() => cleanup());

  it("reports clipboard failure and keeps the one-time token available", async () => {
    mocks.writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    render(<WordPressConnections initialConnections={[]} />);
    fireEvent.change(screen.getByLabelText("Site URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate site token" }));

    const copyButton = await screen.findByRole("button", {
      name: "Copy WordPress site token",
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Could not copy the token. Select it and copy it manually."
      );
    });
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("router_wp_secret")).not.toBeNull();
  });
});
