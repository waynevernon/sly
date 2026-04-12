export interface ReleaseInfo {
  tagName: string;
  isPrerelease?: boolean;
  publishedAt?: string | null;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function parseVersion(tagName: string): ParsedVersion;
export function compareVersions(leftTag: string, rightTag: string): number;
export function compareReleaseRecency(
  left: ReleaseInfo,
  right: ReleaseInfo,
): number;
export function selectLatestPublishedRelease(
  releases: ReleaseInfo[],
): ReleaseInfo | null;
export function selectEffectiveBetaChannelRelease(
  releases: ReleaseInfo[],
): ReleaseInfo | null;
