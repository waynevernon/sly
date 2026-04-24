import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { UpdateToast } from "./UpdateToast";

const invokeMock = vi.fn();
const toastDismissMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    dismiss: (...args: unknown[]) => toastDismissMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
  toastDismissMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

function makeUpdate(overrides: Partial<import("@tauri-apps/plugin-updater").Update> = {}) {
  return {
    version: "0.4.0",
    rawJson: {
      notes: "Bug fixes and performance improvements.",
    },
    body: "Bug fixes and performance improvements.",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as import("@tauri-apps/plugin-updater").Update;
}

describe("UpdateToast", () => {
  it("renders release notes text and a release notes button", () => {
    render(<UpdateToast update={makeUpdate()} toastId="update-toast" />);

    expect(
      screen.getByText("Bug fixes and performance improvements."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Release Notes" }),
    ).toBeInTheDocument();
  });

  it("opens the derived release-notes URL with the safe opener", async () => {
    const user = userEvent.setup();

    render(<UpdateToast update={makeUpdate()} toastId="update-toast" />);

    await user.click(screen.getByRole("button", { name: "Release Notes" }));

    expect(invokeMock).toHaveBeenCalledWith("open_url_safe", {
      url: "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("prefers an explicit release-notes URL from raw metadata", async () => {
    const user = userEvent.setup();

    render(
      <UpdateToast
        update={makeUpdate({
          rawJson: {
            notes: "Bug fixes and performance improvements.",
            releaseNotesUrl: "https://example.com/releases/v0.4.0",
          },
          body: "Bug fixes and performance improvements.",
        })}
        toastId="update-toast"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Release Notes" }));

    expect(invokeMock).toHaveBeenCalledWith("open_url_safe", {
      url: "https://example.com/releases/v0.4.0",
    });
  });

  it("omits the release notes button when no valid URL exists", () => {
    render(
      <UpdateToast
        update={makeUpdate({
          version: "",
          rawJson: { notes: "Bug fixes and performance improvements." },
          body: "Bug fixes and performance improvements.",
        })}
        toastId="update-toast"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Release Notes" }),
    ).not.toBeInTheDocument();
  });

  it("offers a restart action after installing the update", async () => {
    const user = userEvent.setup();
    const update = makeUpdate();

    render(<UpdateToast update={update} toastId="update-toast" />);

    await user.click(screen.getByRole("button", { name: "Update Now" }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Update installed. Restart Sly to apply it.",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Restart" }),
        }),
      );
    });

    const [, toastOptions] = toastSuccessMock.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    toastOptions.action.onClick();

    expect(invokeMock).toHaveBeenCalledWith("restart_app");
  });
});
