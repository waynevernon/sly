import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountBadge } from "./CountBadge";

describe("CountBadge", () => {
  it("uses the default plain column active treatment", () => {
    render(<CountBadge count={12} />);

    const badge = screen.getByText("12");
    expect(badge.className).toMatch(/ui-count-badge/);
    expect(badge.className).toMatch(/ui-count-badge--column-layout/);
    expect(badge.className).toMatch(/ui-count-badge--plain/);
    expect(badge.className).toMatch(/ui-count-badge--active/);
  });

  it("supports alternate layout, tone, and emphasis variants", () => {
    render(
      <CountBadge
        count={3}
        layout="inline"
        tone="filled"
        emphasis="inactive"
      />,
    );

    const badge = screen.getByText("3");
    expect(badge.className).toMatch(/ui-count-badge--inline/);
    expect(badge.className).toMatch(/ui-count-badge--filled/);
    expect(badge.className).toMatch(/ui-count-badge--inactive/);
  });
});
