import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionsSettingsSection } from "./ExtensionsSettingsSection";
import * as cliService from "../../services/cli";

vi.mock("../../services/cli", () => ({
  getCliStatus: vi.fn(),
  installCli: vi.fn(),
  uninstallCli: vi.fn(),
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
});
