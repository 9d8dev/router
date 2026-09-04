import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Usage } from "../components/parts/usage";

describe("Usage overview", () => {
  afterEach(() => cleanup());

  it("shows the same floored grace boundary enforced for non-round limits", () => {
    render(<Usage totalUsage={15} used={16} plan="enterprise" />);

    expect(screen.getByText("Grace capacity: 0 leads remaining")).not.toBeNull();
  });
});
