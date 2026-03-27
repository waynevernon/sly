import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gitService from "../services/git";
import * as notesService from "../services/notes";
import { GitProvider, useGit } from "./GitContext";
import { useNotesData } from "./NotesContext";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../services/git", () => ({
  isGitAvailable: vi.fn(),
  getGitStatus: vi.fn(),
  initGitRepo: vi.fn(),
  gitCommit: vi.fn(),
  gitPush: vi.fn(),
  gitFetch: vi.fn(),
  gitPull: vi.fn(),
  addRemote: vi.fn(),
  pushWithUpstream: vi.fn(),
}));

vi.mock("../services/notes", () => ({
  getSettings: vi.fn(),
  updateGitEnabled: vi.fn(),
}));

vi.mock("./NotesContext", () => ({
  useNotesData: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Wrapper({ children }: PropsWithChildren) {
  return <GitProvider>{children}</GitProvider>;
}

const baseStatus = {
  isRepo: true,
  hasRemote: true,
  hasUpstream: true,
  remoteUrl: "git@github.com:waynevernon/sly.git",
  changedCount: 0,
  aheadCount: 0,
  behindCount: 0,
  currentBranch: "main",
  error: null,
} satisfies Awaited<ReturnType<typeof gitService.getGitStatus>>;

describe("GitContext", () => {
  beforeEach(() => {
    vi.mocked(useNotesData).mockReturnValue({
      notesFolder: "/notes",
    } as never);

    vi.mocked(gitService.isGitAvailable).mockResolvedValue(true);
    vi.mocked(gitService.getGitStatus).mockResolvedValue(baseStatus);
    vi.mocked(gitService.initGitRepo).mockResolvedValue();
    vi.mocked(gitService.gitCommit).mockResolvedValue({
      success: true,
      message: "ok",
      error: null,
    });
    vi.mocked(gitService.pushWithUpstream).mockResolvedValue({
      success: true,
      message: "ok",
      error: null,
    });
    vi.mocked(notesService.getSettings).mockResolvedValue({
      gitEnabled: true,
    });
  });

  it("initializes a repo and refreshes status", async () => {
    const { result } = renderHook(() => useGit(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.gitEnabled).toBe(true);
      expect(result.current.status).toEqual(baseStatus);
    });

    vi.clearAllMocks();

    let success = false;
    await act(async () => {
      success = await result.current.initRepo();
    });

    expect(success).toBe(true);
    expect(gitService.initGitRepo).toHaveBeenCalledTimes(1);
    expect(gitService.getGitStatus).toHaveBeenCalledTimes(1);
  });

  it("tracks commit progress while the request is in flight", async () => {
    const pendingCommit = createDeferred<Awaited<ReturnType<typeof gitService.gitCommit>>>();
    vi.mocked(gitService.gitCommit).mockReturnValueOnce(pendingCommit.promise);

    const { result } = renderHook(() => useGit(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.gitEnabled).toBe(true);
      expect(result.current.status).toEqual(baseStatus);
    });

    vi.clearAllMocks();

    let commitPromise!: Promise<boolean>;
    act(() => {
      commitPromise = result.current.commit("checkpoint");
    });

    expect(result.current.isCommitting).toBe(true);
    expect(gitService.gitCommit).toHaveBeenCalledWith("checkpoint");

    pendingCommit.resolve({
      success: true,
      message: "ok",
      error: null,
    });

    await act(async () => {
      await commitPromise;
    });

    expect(await commitPromise).toBe(true);
    expect(result.current.isCommitting).toBe(false);
    expect(gitService.getGitStatus).toHaveBeenCalledTimes(1);
  });

  it("tracks push-with-upstream progress while the request is in flight", async () => {
    const pendingPush = createDeferred<Awaited<ReturnType<typeof gitService.pushWithUpstream>>>();
    vi.mocked(gitService.pushWithUpstream).mockReturnValueOnce(pendingPush.promise);

    const { result } = renderHook(() => useGit(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.gitEnabled).toBe(true);
      expect(result.current.status).toEqual(baseStatus);
    });

    vi.clearAllMocks();

    let pushPromise!: Promise<boolean>;
    act(() => {
      pushPromise = result.current.pushWithUpstream();
    });

    expect(result.current.isPushing).toBe(true);
    expect(gitService.pushWithUpstream).toHaveBeenCalledTimes(1);

    pendingPush.resolve({
      success: true,
      message: "ok",
      error: null,
    });

    await act(async () => {
      await pushPromise;
    });

    expect(await pushPromise).toBe(true);
    expect(result.current.isPushing).toBe(false);
    expect(gitService.getGitStatus).toHaveBeenCalledTimes(1);
  });
});
