import { describe, expect, it } from "vitest";
import { getUpdateToastContent } from "./updateMetadata";

describe("getUpdateToastContent", () => {
  it("extracts a release-notes URL from notes text", () => {
    expect(
      getUpdateToastContent({
        notes:
          "Code block copy button\nMore reliable rename handling\nhttps://github.com/waynevernon/sly/releases/tag/v0.4.0",
      }, "0.4.0"),
    ).toEqual({
      body: "Code block copy button\nMore reliable rename handling",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("uses normalized body copy when notes only contain a URL", () => {
    expect(
      getUpdateToastContent({
        notes: "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
      }, "0.4.0"),
    ).toEqual({
      body: "See what's new in this release.",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("keeps plain notes and derives the release URL from the version", () => {
    expect(
      getUpdateToastContent({
        notes: "Bug fixes and performance improvements.",
      }, "0.4.0"),
    ).toEqual({
      body: "Bug fixes and performance improvements.",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("prefers an explicit release-notes URL in raw metadata", () => {
    expect(
      getUpdateToastContent({
        notes: "Bug fixes and performance improvements.",
        releaseNotesUrl: "https://example.com/releases/v0.4.0",
      }, "0.4.0"),
    ).toEqual({
      body: "Bug fixes and performance improvements.",
      releaseNotesUrl: "https://example.com/releases/v0.4.0",
    });
  });

  it("uses the fallback body when no notes exist", () => {
    expect(getUpdateToastContent({}, "0.4.0", undefined)).toEqual({
      body: "A new version is ready to install.",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("omits the release-notes URL when the version is unavailable", () => {
    expect(
      getUpdateToastContent(
        { notes: "Bug fixes and performance improvements." },
        "",
      ),
    ).toEqual({
      body: "Bug fixes and performance improvements.",
      releaseNotesUrl: null,
    });
  });
});
