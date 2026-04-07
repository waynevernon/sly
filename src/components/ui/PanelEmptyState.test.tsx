import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Search } from "lucide-react";
import { PanelEmptyState } from "./PanelEmptyState";

describe("PanelEmptyState", () => {
  it("uses a solid muted theme color for the icon wrapper", () => {
    const { container } = render(
      <PanelEmptyState
        icon={<Search />}
        title="Nothing here"
        message="Create a note to get started."
      />,
    );

    const iconWrapper = container.querySelector("svg")?.parentElement;

    expect(iconWrapper).not.toBeNull();
    expect(iconWrapper).toHaveClass("text-text-muted");
    expect(iconWrapper).not.toHaveClass("text-text-muted/40");
  });
});
