import { describe, expect, it } from "vitest";
import { isAllowedUrlScheme, normalizeUrl } from "./linkUtils";

describe("linkUtils", () => {
  it("prepends https when a URL has no scheme", () => {
    expect(normalizeUrl("google.com")).toBe("https://google.com");
  });

  it("preserves allowed URLs with an existing scheme", () => {
    expect(normalizeUrl("mailto:test@example.com")).toBe(
      "mailto:test@example.com",
    );
  });

  it("accepts allowed schemes", () => {
    expect(isAllowedUrlScheme("https://example.com")).toBe(true);
    expect(isAllowedUrlScheme("mailto:test@example.com")).toBe(true);
  });

  it("rejects disallowed schemes", () => {
    expect(isAllowedUrlScheme("javascript:alert(1)")).toBe(false);
  });
});
