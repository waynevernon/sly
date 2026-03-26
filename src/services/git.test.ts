import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as gitService from "./git";

describe("git service", () => {
  afterEach(() => {
    clearMocks();
  });

  it("routes git_commit with the message payload", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return { success: true, message: "ok", error: null };
    });

    await gitService.gitCommit("checkpoint");

    expect(calls).toEqual([
      {
        cmd: "git_commit",
        payload: { message: "checkpoint" },
      },
    ]);
  });

  it("routes git_push_with_upstream without arguments", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return { success: true, message: "ok", error: null };
    });

    await gitService.pushWithUpstream();

    expect(calls).toEqual([
      {
        cmd: "git_push_with_upstream",
        payload: {},
      },
    ]);
  });
});
