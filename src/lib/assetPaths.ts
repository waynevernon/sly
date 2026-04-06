import type { JSONContent } from "@tiptap/core";
import { convertFileSrc } from "@tauri-apps/api/core";

const ASSETS_PREFIX = "assets/";

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function stripTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function joinNotesFolderPath(notesFolder: string, relativePath: string): string {
  const trimmedRoot = stripTrailingSeparators(notesFolder);
  if (trimmedRoot.includes("\\")) {
    return `${trimmedRoot}\\${relativePath.replace(/\//g, "\\")}`;
  }

  return `${trimmedRoot}/${relativePath}`;
}

function extractAbsolutePathFromAssetUrl(src: string): string | null {
  try {
    const parsed = new URL(src);
    const isAssetProtocol =
      parsed.protocol === "asset:" || parsed.hostname === "asset.localhost";

    if (!isAssetProtocol) {
      return null;
    }

    let decodedPath = decodeURIComponent(parsed.pathname);
    decodedPath = decodedPath.replace(/^\/{2,}/, "/");
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      decodedPath = decodedPath.slice(1);
    }

    return decodedPath;
  } catch {
    return null;
  }
}

export function isStoredAssetPath(src: string): boolean {
  const trimmed = src.trim();
  return (
    trimmed.startsWith(ASSETS_PREFIX) &&
    !trimmed.includes("://") &&
    !trimmed.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

export function toDisplayImageSrc(src: string, notesFolder: string | null): string {
  if (!notesFolder || !isStoredAssetPath(src)) {
    return src;
  }

  return convertFileSrc(joinNotesFolderPath(notesFolder, src));
}

export function toStoredImageSrc(src: string, notesFolder: string | null): string {
  if (!notesFolder || isStoredAssetPath(src)) {
    return src;
  }

  const absolutePath = extractAbsolutePathFromAssetUrl(src);
  if (!absolutePath) {
    return src;
  }

  const normalizedRoot = stripTrailingSeparators(toPosixPath(notesFolder));
  const normalizedAbsolute = toPosixPath(absolutePath);

  if (!normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
    return src;
  }

  const relativePath = normalizedAbsolute.slice(normalizedRoot.length + 1);
  return relativePath.startsWith(ASSETS_PREFIX) ? relativePath : src;
}

function mapImageNodeSources(
  node: JSONContent,
  transform: (src: string) => string,
): JSONContent {
  const nextNode: JSONContent = { ...node };

  if (node.type === "image" && typeof node.attrs?.src === "string") {
    nextNode.attrs = {
      ...node.attrs,
      src: transform(node.attrs.src),
    };
  }

  if (node.content) {
    nextNode.content = node.content.map((child) => mapImageNodeSources(child, transform));
  }

  return nextNode;
}

export function toDisplayDocumentAssetPaths(
  document: JSONContent,
  notesFolder: string | null,
): JSONContent {
  if (!notesFolder) {
    return document;
  }

  return mapImageNodeSources(document, (src) => toDisplayImageSrc(src, notesFolder));
}

export function toStoredDocumentAssetPaths(
  document: JSONContent,
  notesFolder: string | null,
): JSONContent {
  if (!notesFolder) {
    return document;
  }

  return mapImageNodeSources(document, (src) => toStoredImageSrc(src, notesFolder));
}
