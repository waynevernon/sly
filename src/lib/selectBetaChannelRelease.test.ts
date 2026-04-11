import { describe, expect, it } from "vitest";
import {
  selectEffectiveBetaChannelRelease,
  selectLatestPublishedRelease,
} from "../../scripts/select-beta-channel-release-lib.mjs";

describe("select-beta-channel-release-lib", () => {
  it("prefers a newer published stable release over an older beta with a higher semver", () => {
    const selected = selectEffectiveBetaChannelRelease([
      {
        tagName: "v1.4.0-beta.2",
        isPrerelease: true,
        publishedAt: "2026-04-01T12:00:00Z",
      },
      {
        tagName: "v1.3.1",
        isPrerelease: false,
        publishedAt: "2026-04-10T12:00:00Z",
      },
    ]);

    expect(selected?.tagName).toBe("v1.3.1");
  });

  it("prefers a newer published beta release over an older stable release", () => {
    const selected = selectEffectiveBetaChannelRelease([
      {
        tagName: "v1.3.1",
        isPrerelease: false,
        publishedAt: "2026-04-01T12:00:00Z",
      },
      {
        tagName: "v1.4.0-beta.2",
        isPrerelease: true,
        publishedAt: "2026-04-10T12:00:00Z",
      },
    ]);

    expect(selected?.tagName).toBe("v1.4.0-beta.2");
  });

  it("treats the latest stable release as the most recently published one", () => {
    const selected = selectLatestPublishedRelease([
      {
        tagName: "v1.4.0",
        isPrerelease: false,
        publishedAt: "2026-04-01T12:00:00Z",
      },
      {
        tagName: "v1.3.2",
        isPrerelease: false,
        publishedAt: "2026-04-10T12:00:00Z",
      },
    ]);

    expect(selected?.tagName).toBe("v1.3.2");
  });
});
