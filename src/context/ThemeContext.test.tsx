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
      uiFont: { kind: "preset", value: "inter" },
      noteFont: { kind: "preset", value: "atkinson-hyperlegible-next" },
      codeFont: { kind: "preset", value: "jetbrains-mono" },
      noteTypography: { baseFontSize: 16, boldWeight: 600, lineHeight: 1.5 },
      textDirection: "auto",
      editorWidth: "normal",
      interfaceZoom: 1,
      paneMode: 3,
      foldersPaneWidth: 240,
      notesPaneWidth: 304,
      rightPanelVisible: true,
      rightPanelWidth: 260,
      rightPanelTab: "outline",
      confirmDeletions: true,
      sourceModeWordWrap: false,
    });
    vi.mocked(notesService.updateAppearanceSettings).mockResolvedValue();
  });

  it("uses canonical persisted values from the backend", async () => {
    vi.mocked(notesService.getAppearanceSettings).mockResolvedValueOnce({
      mode: "dark",
      lightPresetId: "nord-light",
      darkPresetId: "nord",
      uiFont: { kind: "preset", value: "inter" },
      noteFont: { kind: "preset", value: "atkinson-hyperlegible-next" },
      codeFont: { kind: "preset", value: "jetbrains-mono" },
      noteTypography: { baseFontSize: 16, boldWeight: 600, lineHeight: 1.5 },
      textDirection: "auto",
      editorWidth: "wide",
      interfaceZoom: 1.25,
      paneMode: 2,
      foldersPaneWidth: 260,
      notesPaneWidth: 320,
      rightPanelVisible: false,
      rightPanelWidth: 300,
      rightPanelTab: "assistant",
      confirmDeletions: false,
      sourceModeWordWrap: true,
    });

    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });

    expect(result.current.editorWidth).toBe("wide");
    expect(result.current.interfaceZoom).toBe(1.25);
    expect(result.current.paneMode).toBe(2);
    expect(result.current.foldersPaneWidth).toBe(260);
    expect(result.current.notesPaneWidth).toBe(320);
    expect(result.current.rightPanelVisible).toBe(false);
    expect(result.current.rightPanelWidth).toBe(300);
    expect(result.current.rightPanelTab).toBe("assistant");
    expect(result.current.confirmDeletions).toBe(false);
    expect(result.current.sourceModeWordWrap).toBe(true);
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

  it("clamps right panel width before persisting", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.rightPanelWidth).toBe(260);
    });

    act(() => {
      result.current.setRightPanelWidth(999);
    });

    await waitFor(() => {
      expect(notesService.updateAppearanceSettings).toHaveBeenCalled();
    });

    const updateCalls = vi.mocked(notesService.updateAppearanceSettings).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];

    expect(lastUpdate?.rightPanelWidth).toBe(420);
  });

  it("keeps pane mode unchanged when resetting typography and layout settings", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.paneMode).toBe(3);
    });

    act(() => {
      result.current.setPaneMode(1);
      result.current.resetTypographyAndLayoutSettings();
    });

    await waitFor(() => {
      expect(notesService.updateAppearanceSettings).toHaveBeenCalled();
    });

    expect(result.current.paneMode).toBe(1);

    const updateCalls = vi.mocked(notesService.updateAppearanceSettings).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];

    expect(lastUpdate?.paneMode).toBe(1);
  });

  it("persists the source mode word wrap preference", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.sourceModeWordWrap).toBe(false);
    });

    act(() => {
      result.current.setSourceModeWordWrap(true);
    });

    await waitFor(() => {
      expect(notesService.updateAppearanceSettings).toHaveBeenCalled();
    });

    const updateCalls = vi.mocked(notesService.updateAppearanceSettings).mock.calls;
    const lastUpdate = updateCalls[updateCalls.length - 1]?.[0];

    expect(lastUpdate?.sourceModeWordWrap).toBe(true);
  });
});
