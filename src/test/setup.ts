import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { clearMocks, mockWindows } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  mockWindows("main");
});

afterEach(() => {
  cleanup();
  clearMocks();
  vi.restoreAllMocks();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 0);
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
}
