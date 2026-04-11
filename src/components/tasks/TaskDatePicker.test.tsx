import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui";
import { TaskDatePicker } from "./TaskDatePicker";

describe("TaskDatePicker", () => {
  it("applies Next week as next Monday", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TooltipProvider>
        <TaskDatePicker
          actionDate=""
          scheduleBucket={null}
          today="2026-04-10"
          onChange={onChange}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Set date" }));
    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(onChange).toHaveBeenCalledWith({
      actionDate: "2026-04-13",
      scheduleBucket: null,
    });
  });

  it("clears the current selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TooltipProvider>
        <TaskDatePicker
          actionDate="2026-04-10"
          scheduleBucket={null}
          today="2026-04-10"
          onChange={onChange}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith({
      actionDate: null,
      scheduleBucket: null,
    });
  });
});
