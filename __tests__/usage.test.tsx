import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Usage } from "../components/parts/usage";

describe("Usage overview", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("counts down to the UTC month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:30:00Z"));
    render(<Usage totalUsage={100} used={0} plan="free" />);
    expect(screen.getByText("31")).not.toBeNull();
  });

  it("shows the same floored grace boundary enforced for non-round limits", () => {
    render(<Usage totalUsage={15} used={16} plan="enterprise" />);

    expect(screen.getByText("Grace capacity: 0 leads remaining")).not.toBeNull();
  });
});
