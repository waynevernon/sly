import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as notesService from "./notes";

describe("notes service", () => {
  afterEach(() => {
    clearMocks();
  });

  it("routes create_note with a null folder when omitted", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return { id: "new", title: "New", content: "", path: "", modified: 0 };
    });

    await notesService.createNote();

    expect(calls).toEqual([
      {
        cmd: "create_note",
        payload: { targetFolder: null },
      },
    ]);
  });

  it("routes patch_settings with the provided shallow patch", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await notesService.patchSettings({ defaultNoteName: "Daily Note" });

    expect(calls).toEqual([
      {
        cmd: "patch_settings",
        payload: { patch: { defaultNoteName: "Daily Note" } },
      },
    ]);
  });

  it("routes get_ai_working_directory without a payload", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return "/tmp/reference";
    });

    await expect(notesService.getAiWorkingDirectory()).resolves.toBe(
      "/tmp/reference",
    );

    expect(calls).toEqual([
      {
        cmd: "get_ai_working_directory",
        payload: {},
      },
    ]);
  });

  it("routes set_ai_working_directory with a nullable path", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await expect(notesService.setAiWorkingDirectory(null)).resolves.toBeNull();

    expect(calls).toEqual([
      {
        cmd: "set_ai_working_directory",
        payload: { path: null },
      },
    ]);
  });

  it("routes preview_note_name with the template payload", async () => {
    mockIPC((cmd, payload) => {
      expect(cmd).toBe("preview_note_name");
      expect(payload).toEqual({ template: "Daily-{counter}" });
      return "Daily-1";
    });

    await expect(
      notesService.previewNoteName("Daily-{counter}"),
    ).resolves.toBe("Daily-1");
  });

  it("routes delete_notes with the provided ids", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await notesService.deleteNotes(["alpha", "beta"]);

    expect(calls).toEqual([
      {
        cmd: "delete_notes",
        payload: { ids: ["alpha", "beta"] },
      },
    ]);
  });

  it("routes move_notes with the provided ids and target folder", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return [{ from: "alpha", to: "archive/alpha" }];
    });

    await expect(
      notesService.moveNotes(["alpha"], "archive"),
    ).resolves.toEqual([{ from: "alpha", to: "archive/alpha" }]);

    expect(calls).toEqual([
      {
        cmd: "move_notes",
        payload: { ids: ["alpha"], targetFolder: "archive" },
      },
    ]);
  });

  it("routes open_note_window with the provided note id", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await notesService.openNoteWindow("alpha");

    expect(calls).toEqual([
      {
        cmd: "open_note_window",
        payload: { noteId: "alpha" },
      },
    ]);
  });

  it("routes sync_note_window_identity with the latest note identity", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await notesService.syncNoteWindowIdentity("alpha-renamed", "Alpha Renamed");

    expect(calls).toEqual([
      {
        cmd: "sync_note_window_identity",
        payload: { noteId: "alpha-renamed", title: "Alpha Renamed" },
      },
    ]);
  });
});
