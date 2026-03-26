import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notesService from "../../services/notes";
import { renderWithProviders } from "../../test/render";
import { GeneralSettingsSection } from "./GeneralSettingsSection";

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../../context/GitContext", () => ({
  useGit: vi.fn(),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(),
}));

vi.mock("../../services/notes", () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
  previewNoteName: vi.fn(),
}));

describe("GeneralSettingsSection", () => {
  beforeEach(async () => {
    const notesContext = await import("../../context/NotesContext");
    const gitContext = await import("../../context/GitContext");
    const themeContext = await import("../../context/ThemeContext");

    vi.mocked(notesContext.useNotes).mockReturnValue({
      notesFolder: "/tmp/notes",
      setNotesFolder: vi.fn(),
    } as never);
    vi.mocked(gitContext.useGit).mockReturnValue({
      status: null,
      gitAvailable: false,
      gitEnabled: false,
      isUpdatingGitEnabled: false,
      setGitEnabled: vi.fn(),
      initRepo: vi.fn(),
      isLoading: false,
      addRemote: vi.fn(),
      pushWithUpstream: vi.fn(),
      isAddingRemote: false,
      isPushing: false,
      lastError: null,
      clearError: vi.fn(),
    } as never);
    vi.mocked(themeContext.useTheme).mockReturnValue({
      confirmDeletions: true,
      setConfirmDeletions: vi.fn(),
    } as never);

    vi.mocked(notesService.getSettings).mockResolvedValue({
      defaultNoteName: "Untitled",
    });
    vi.mocked(notesService.previewNoteName).mockResolvedValue("Daily Note");
    vi.mocked(notesService.patchSettings).mockResolvedValue();
  });

  it("saves the default note name through patchSettings on blur", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettingsSection />);

    const input = await screen.findByPlaceholderText("Untitled");
    await user.clear(input);
    await user.type(input, "Daily Note");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(notesService.patchSettings).toHaveBeenCalledWith({
        defaultNoteName: "Daily Note",
      });
    });
  });
});
