import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiProvider } from "../../services/ai";
import type {
  AssistantThreadState,
  AssistantTurn,
} from "../../types/assistant";
import { TooltipProvider } from "../ui";
import {
  RightPanelAssistant,
  type RightPanelAssistantProps,
} from "./RightPanelAssistant";

function makeThread(
  overrides: Partial<AssistantThreadState> = {},
): AssistantThreadState {
  return {
    provider: "claude",
    scope: "note",
    scopeManual: false,
    draft: "",
    turns: [],
    pending: false,
    lastSuccessfulSnapshotHash: null,
    ...overrides,
  };
}

function makeProps(
  overrides: Partial<RightPanelAssistantProps> = {},
): RightPanelAssistantProps {
  return {
    hasNote: true,
    providerCheckComplete: true,
    availableProviders: ["claude", "codex"] as AiProvider[],
    thread: makeThread(),
    onProviderChange: vi.fn(),
    onScopeChange: vi.fn(),
    onDraftChange: vi.fn(),
    onClearThread: vi.fn(),
    onSubmit: vi.fn(),
    onApplyProposal: vi.fn(),
    ...overrides,
  };
}

function renderAssistant(props: RightPanelAssistantProps) {
  return render(
    <TooltipProvider>
      <RightPanelAssistant {...props} />
    </TooltipProvider>,
  );
}

describe("RightPanelAssistant", () => {
  it("renders provider, scope, and send inside the composer footer", () => {
    renderAssistant(makeProps());

    const composer = screen.getByRole("group", { name: "Assistant composer" });
    const footer = within(composer).getByRole("group", {
      name: "Assistant composer footer",
    });

    expect(
      within(composer).getByPlaceholderText(
        "Ask about the current note, request a rewrite, or focus on the current section or selection.",
      ),
    ).toBeInTheDocument();
    expect(
      within(footer).getByRole("button", { name: "Assistant provider" }),
    ).toBeInTheDocument();
    expect(
      within(footer).getByRole("button", { name: "Assistant scope" }),
    ).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear thread" })).toBeInTheDocument();
    expect(
      within(footer).queryByRole("button", { name: "Clear thread" }),
    ).not.toBeInTheDocument();
  });

  it("disables send for empty drafts and while pending", () => {
    const { rerender } = renderAssistant(makeProps());

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    rerender(
      <TooltipProvider>
        <RightPanelAssistant
          {...makeProps({
            thread: makeThread({
              draft: "Rewrite this section",
              pending: true,
            }),
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
  });

  it("submits on Ctrl+Enter from the composer", () => {
    const onSubmit = vi.fn();

    renderAssistant(
      makeProps({
        thread: makeThread({ draft: "Tighten this paragraph" }),
        onSubmit,
      }),
    );

    fireEvent.keyDown(screen.getByRole("textbox"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("fires provider and scope changes from the composer footer", async () => {
    const user = userEvent.setup();
    const onProviderChange = vi.fn();
    const onScopeChange = vi.fn();

    renderAssistant(
      makeProps({
        onProviderChange,
        onScopeChange,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Assistant provider" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Codex/i }));

    await user.click(screen.getByRole("button", { name: "Assistant scope" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Selection/i }));

    expect(onProviderChange).toHaveBeenCalledWith("codex");
    expect(onScopeChange).toHaveBeenCalledWith("selection");
  });

  it("keeps clear thread disabled and enabled under the existing state rules", async () => {
    const user = userEvent.setup();
    const onClearThread = vi.fn();

    const { rerender } = renderAssistant(
      makeProps({
        thread: makeThread(),
        onClearThread,
      }),
    );

    expect(screen.getByRole("button", { name: "Clear thread" })).toBeDisabled();

    rerender(
      <TooltipProvider>
        <RightPanelAssistant
          {...makeProps({
            thread: makeThread({ draft: "Queue a change" }),
            onClearThread,
          })}
        />
      </TooltipProvider>,
    );

    const clearButton = screen.getByRole("button", { name: "Clear thread" });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);
    expect(onClearThread).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <RightPanelAssistant
          {...makeProps({
            thread: makeThread({
              draft: "Queue a change",
              pending: true,
            }),
            onClearThread,
          })}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Clear thread" })).toBeDisabled();
  });

  it("renders assistant turns unchanged inside the transcript", () => {
    const turns: AssistantTurn[] = [
      {
        id: "user-1",
        kind: "user",
        text: "Rewrite the intro",
        createdAt: 1,
        scope: "section",
        scopeLabel: "Current section",
        lineLabel: "Lines 1-4",
        snapshotHash: "hash-1",
      },
      {
        id: "assistant-1",
        kind: "assistant",
        replyText: "I tightened the intro.",
        proposals: [],
        createdAt: 2,
        snapshotHash: "hash-1",
        snapshotMarkdown: "# Title",
        scopeStartLine: 1,
        scopeEndLine: 4,
        invalidProposalIds: [],
      },
    ];

    renderAssistant(
      makeProps({
        thread: makeThread({ turns }),
      }),
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Rewrite the intro")).toBeInTheDocument();
    expect(screen.getAllByText("Assistant")).toHaveLength(1);
    expect(screen.getByText("I tightened the intro.")).toBeInTheDocument();
  });
});
