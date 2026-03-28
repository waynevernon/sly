import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as pdfService from "./pdf";

describe("pdf service", () => {
  afterEach(() => {
    clearMocks();
  });

  it("routes open_print_preview with the note path payload", async () => {
    const calls: Array<{ cmd: string; payload: unknown }> = [];
    mockIPC((cmd, payload) => {
      calls.push({ cmd, payload });
      return null;
    });

    await pdfService.downloadPdf("/tmp/print-note.md");

    expect(calls).toEqual([
      {
        cmd: "open_print_preview",
        payload: { path: "/tmp/print-note.md" },
      },
    ]);
  });
});
