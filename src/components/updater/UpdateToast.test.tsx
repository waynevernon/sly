import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { UpdateToast } from "./UpdateToast";

const invokeMock = vi.fn();
const toastMock = vi.fn();
const toastDismissMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("sonner", () => {
  const toast = Object.assign((...args: unknown[]) => toastMock(...args), {
    dismiss: (...args: unknown[]) => toastDismissMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  });

  return { toast };
});

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.mockReset();
  toastDismissMock.mockReset();
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

  it("offers a restart button after installing the update", async () => {
    const user = userEvent.setup();
    const update = makeUpdate();

    render(<UpdateToast update={update} toastId="update-toast" />);

    await user.click(screen.getByRole("button", { name: "Update Now" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: "update-installed-toast",
          closeButton: true,
          duration: Infinity,
        }),
      );
    });

    const [installedToast] = toastMock.mock.calls[0] as [
      ReactElement,
      unknown,
    ];
    render(installedToast);

    await user.click(screen.getByRole("button", { name: "Restart" }));

    expect(invokeMock).toHaveBeenCalledWith("restart_app");
  });
});
