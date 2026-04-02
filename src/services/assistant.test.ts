import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import { executeAssistantTurn } from "./assistant";

describe("assistant service", () => {
  afterEach(() => {
    clearMocks();
  });

  it("routes ai_assistant_turn with the full request payload", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return {
        replyText: "Here is a revision.",
        proposals: [],
        warning: null,
      };
    });

    await executeAssistantTurn({
      provider: "claude",
      noteId: "alpha",
      notePath: "/notes/alpha.md",
      noteTitle: "Alpha",
      scope: "section",
      scopeLabel: "Section: Intro",
      startLine: 3,
      endLine: 10,
      snapshotHash: "deadbeef",
      numberedContent: "3 | ## Intro",
      userPrompt: "Tighten this section.",
      history: [{ role: "user", text: "Previous turn" }],
    });

    expect(calls).toEqual([
      {
        cmd: "ai_assistant_turn",
        payload: {
          request: {
            provider: "claude",
            noteId: "alpha",
            notePath: "/notes/alpha.md",
            noteTitle: "Alpha",
            scope: "section",
            scopeLabel: "Section: Intro",
            startLine: 3,
            endLine: 10,
            snapshotHash: "deadbeef",
            numberedContent: "3 | ## Intro",
            userPrompt: "Tighten this section.",
            history: [{ role: "user", text: "Previous turn" }],
          },
        },
      },
    ]);
  });
});
