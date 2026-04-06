import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${encodeURIComponent(filePath)}`),
}));

import {
  isStoredAssetPath,
  toDisplayDocumentAssetPaths,
  toDisplayImageSrc,
  toStoredDocumentAssetPaths,
  toStoredImageSrc,
} from "./assetPaths";

describe("assetPaths", () => {
  it("recognizes only vault-relative assets paths", () => {
    expect(isStoredAssetPath("assets/image.png")).toBe(true);
    expect(isStoredAssetPath(" asset://localhost/foo ")).toBe(false);
    expect(isStoredAssetPath("/assets/image.png")).toBe(false);
    expect(isStoredAssetPath("C:\\vault\\assets\\image.png")).toBe(false);
  });

  it("converts stored asset paths to display URLs", () => {
    expect(toDisplayImageSrc("assets/image.png", "/vault")).toBe(
      "asset://localhost/%2Fvault%2Fassets%2Fimage.png",
    );
    expect(toDisplayImageSrc("https://example.com/image.png", "/vault")).toBe(
      "https://example.com/image.png",
    );
  });

  it("converts asset URLs inside the notes folder back to relative asset paths", () => {
    expect(
      toStoredImageSrc("asset://localhost//vault/assets/image.png", "/vault"),
    ).toBe("assets/image.png");
    expect(
      toStoredImageSrc(
        "http://asset.localhost/C:/vault/assets/image.png",
        "C:\\vault",
      ),
    ).toBe("assets/image.png");
    expect(
      toStoredImageSrc("asset://localhost//other/assets/image.png", "/vault"),
    ).toBe("asset://localhost//other/assets/image.png");
  });

  it("rewrites image nodes for display and storage", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          type: "image",
          attrs: {
            src: "assets/photo.png",
            alt: "Photo",
          },
        },
      ],
    };

    const displayDocument = toDisplayDocumentAssetPaths(document, "/vault");
    expect(displayDocument.content?.[1]).toMatchObject({
      type: "image",
      attrs: {
        src: "asset://localhost/%2Fvault%2Fassets%2Fphoto.png",
      },
    });

    const storedDocument = toStoredDocumentAssetPaths(displayDocument, "/vault");
    expect(storedDocument.content?.[1]).toMatchObject({
      type: "image",
      attrs: {
        src: "assets/photo.png",
      },
    });
  });
});
