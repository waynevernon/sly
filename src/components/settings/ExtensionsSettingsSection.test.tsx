import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionsSettingsSection } from "./ExtensionsSettingsSection";
import * as cliService from "../../services/cli";
import * as notesService from "../../services/notes";

vi.mock("../../services/cli", () => ({
  getCliStatus: vi.fn(),
  installCli: vi.fn(),
  uninstallCli: vi.fn(),
}));

vi.mock("../../services/notes", () => ({
  getAiWorkingDirectory: vi.fn(),
  setAiWorkingDirectory: vi.fn(),
}));

vi.mock("./GitSettingsSection", () => ({
  GitSettingsSection: () => <div data-testid="git-settings-section" />,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ExtensionsSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesService.getAiWorkingDirectory).mockResolvedValue(null);
  });

  afterEach(() => {
    clearMocks();
  });

  it("refreshes shared AI provider detection on mount", async () => {
    vi.mocked(cliService.getCliStatus).mockResolvedValue({
      supported: false,
      installed: false,
      path: null,
    });

    const onRefreshAiProviders = vi.fn().mockResolvedValue(undefined);

    render(
      <ExtensionsSettingsSection
        aiProviders={["claude"]}
        aiProvidersLoading={false}
        onRefreshAiProviders={onRefreshAiProviders}
      />,
    );

    await waitFor(() => {
      expect(onRefreshAiProviders).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("refreshes shared AI provider detection after installing the CLI tool", async () => {
    vi.mocked(cliService.getCliStatus).mockResolvedValue({
      supported: true,
      installed: false,
      path: null,
    });
    vi.mocked(cliService.installCli).mockResolvedValue("/usr/local/bin/sly");

    const onRefreshAiProviders = vi.fn().mockResolvedValue(undefined);

    render(
      <ExtensionsSettingsSection
        aiProviders={[]}
        aiProvidersLoading={false}
        onRefreshAiProviders={onRefreshAiProviders}
      />,
    );

    await waitFor(() => {
      expect(onRefreshAiProviders).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Install CLI Tool" }));

    await waitFor(() => {
      expect(cliService.installCli).toHaveBeenCalledTimes(1);
      expect(onRefreshAiProviders).toHaveBeenCalledTimes(2);
    });
  });

  it("loads the AI reference folder state on mount", async () => {
    vi.mocked(cliService.getCliStatus).mockResolvedValue({
      supported: false,
      installed: false,
      path: null,
    });
    vi.mocked(notesService.getAiWorkingDirectory).mockResolvedValue(
      "/tmp/reference",
    );

    render(
      <ExtensionsSettingsSection
        aiProviders={[]}
        aiProvidersLoading={false}
        onRefreshAiProviders={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(notesService.getAiWorkingDirectory).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Custom folder")).toBeInTheDocument();
    expect(screen.getByText("/tmp/reference")).toBeInTheDocument();
  });

  it("clears the custom AI reference folder when switching back to notes folder", async () => {
    vi.mocked(cliService.getCliStatus).mockResolvedValue({
      supported: false,
      installed: false,
      path: null,
    });
    vi.mocked(notesService.getAiWorkingDirectory).mockResolvedValue(
      "/tmp/reference",
    );
    vi.mocked(notesService.setAiWorkingDirectory).mockResolvedValue(null);

    render(
      <ExtensionsSettingsSection
        aiProviders={[]}
        aiProvidersLoading={false}
        onRefreshAiProviders={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await screen.findByRole("button", { name: "Use Notes Folder" });
    fireEvent.click(screen.getByRole("button", { name: "Use Notes Folder" }));

    await waitFor(() => {
      expect(notesService.setAiWorkingDirectory).toHaveBeenCalledWith(null);
    });

    expect(screen.getAllByText("Notes folder")).toHaveLength(2);
  });

  it("stores the selected custom AI reference folder", async () => {
    vi.mocked(cliService.getCliStatus).mockResolvedValue({
      supported: false,
      installed: false,
      path: null,
    });
    vi.mocked(notesService.setAiWorkingDirectory).mockResolvedValue(
      "/tmp/reference",
    );
    mockIPC((cmd, payload) => {
      expect(cmd).toBe("open_folder_dialog");
      expect(payload).toEqual({ defaultPath: null });
      return "/tmp/reference";
    });

    render(
      <ExtensionsSettingsSection
        aiProviders={[]}
        aiProvidersLoading={false}
        onRefreshAiProviders={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await screen.findByRole("button", { name: "Choose Custom Folder" });
    fireEvent.click(screen.getByRole("button", { name: "Choose Custom Folder" }));

    await waitFor(() => {
      expect(notesService.setAiWorkingDirectory).toHaveBeenCalledWith(
        "/tmp/reference",
      );
    });
  });
});
