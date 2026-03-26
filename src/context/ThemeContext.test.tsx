import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notesService from "../services/notes";
import { ThemeProvider, useTheme } from "./ThemeContext";

vi.mock("../services/notes", () => ({
  getAppearanceSettings: vi.fn(),
  updateAppearanceSettings: vi.fn(),
}));

function Wrapper({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeContext", () => {
  beforeEach(() => {
    vi.mocked(notesService.getAppearanceSettings).mockResolvedValue({
      mode: "system",
      lightPresetId: "nord-light",
      darkPresetId: "nord",
      uiFont: { kind: "preset", value: "system-sans" },
      noteFont: { kind: "preset", value: "system-sans" },
      codeFont: { kind: "preset", value: "system-mono" },
      noteTypography: { baseFontSize: 15, boldWeight: 600, lineHeight: 1.6 },
      textDirection: "auto",
      editorWidth: "normal",
      interfaceZoom: 1,
      paneMode: 3,
      foldersPaneWidth: 240,
      notesPaneWidth: 304,
      confirmDeletions: true,
    });
    vi.mocked(notesService.updateAppearanceSettings).mockResolvedValue();
  });

  it("normalizes invalid persisted values", async () => {
    vi.mocked(notesService.getAppearanceSettings).mockResolvedValueOnce({
      mode: "invalid" as never,
      lightPresetId: "invalid" as never,
      darkPresetId: "invalid" as never,
      uiFont: { kind: "custom", value: "" },
      noteFont: { kind: "custom", value: "" },
      codeFont: { kind: "custom", value: "" },
      noteTypography: { baseFontSize: 15, boldWeight: 600, lineHeight: 1.6 },
      textDirection: "invalid" as never,
      editorWidth: "invalid" as never,
      interfaceZoom: 4,
      paneMode: 9 as never,
      confirmDeletions: undefined,
    });

    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe("system");
    });

    expect(result.current.editorWidth).toBe("normal");
    expect(result.current.interfaceZoom).toBe(1.5);
    expect(result.current.paneMode).toBe(3);
    expect(result.current.confirmDeletions).toBe(true);
  });

  it("clamps interface zoom before persisting", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.interfaceZoom).toBe(1);
    });

    act(() => {
      result.current.setInterfaceZoom(4);
    });

    await waitFor(() => {
      expect(notesService.updateAppearanceSettings).toHaveBeenCalled();
    });

    const updateCalls = vi.mocked(notesService.updateAppearanceSettings).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];

    expect(lastUpdate?.interfaceZoom).toBe(1.5);
  });
});
