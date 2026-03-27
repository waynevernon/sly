import { describe, expect, it } from "vitest";
import { getUpdateToastContent } from "./updateMetadata";

describe("getUpdateToastContent", () => {
  it("extracts a release-notes URL from notes text", () => {
    expect(
      getUpdateToastContent({
        notes: "See https://github.com/waynevernon/sly/releases/tag/v0.4.0 for what's new in this release.",
      }),
    ).toEqual({
      body: "See what's new in this release.",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("uses normalized body copy when notes only contain a URL", () => {
    expect(
      getUpdateToastContent({
        notes: "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
      }),
    ).toEqual({
      body: "See what's new in this release.",
      releaseNotesUrl:
        "https://github.com/waynevernon/sly/releases/tag/v0.4.0",
    });
  });

  it("falls back to plain notes when no release URL exists", () => {
    expect(
      getUpdateToastContent({
        notes: "Bug fixes and performance improvements.",
      }),
    ).toEqual({
      body: "Bug fixes and performance improvements.",
      releaseNotesUrl: null,
    });
  });

  it("ignores invalid or non-http URLs", () => {
    expect(
      getUpdateToastContent({
        notes: "Read ftp://example.com or github.com/waynevernon/sly/releases/tag/v0.4.0",
      }),
    ).toEqual({
      body: "Read ftp://example.com or github.com/waynevernon/sly/releases/tag/v0.4.0",
      releaseNotesUrl: null,
    });
  });

  it("uses the fallback body when no notes exist", () => {
    expect(getUpdateToastContent({}, undefined)).toEqual({
      body: "A new version is ready to install.",
      releaseNotesUrl: null,
    });
  });
});
