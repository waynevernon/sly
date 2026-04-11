export function parseVersion(tagName) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tagName);
  if (!match) {
    throw new Error(`Unsupported release tag '${tagName}'`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
}

export function compareVersions(leftTag, rightTag) {
  const left = parseVersion(leftTag);
  const right = parseVersion(rightTag);

  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  const leftHasPrerelease = left.prerelease.length > 0;
  const rightHasPrerelease = right.prerelease.length > 0;

  if (!leftHasPrerelease && !rightHasPrerelease) {
    return 0;
  }
  if (!leftHasPrerelease) {
    return 1;
  }
  if (!rightHasPrerelease) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }

    const difference = compareIdentifiers(leftPart, rightPart);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parsePublishedAt(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function compareReleaseRecency(left, right) {
  const leftPublishedAt = parsePublishedAt(left.publishedAt);
  const rightPublishedAt = parsePublishedAt(right.publishedAt);

  if (leftPublishedAt !== null && rightPublishedAt !== null && leftPublishedAt !== rightPublishedAt) {
    return leftPublishedAt - rightPublishedAt;
  }

  return compareVersions(left.tagName, right.tagName);
}

export function selectLatestPublishedRelease(releases) {
  if (releases.length === 0) {
    return null;
  }

  return releases.reduce((current, candidate) => {
    if (compareReleaseRecency(candidate, current) > 0) {
      return candidate;
    }
    return current;
  });
}

export function selectEffectiveBetaChannelRelease(releases) {
  const stableRelease = selectLatestPublishedRelease(
    releases.filter((release) => release.isPrerelease !== true),
  );
  const prerelease = selectLatestPublishedRelease(
    releases.filter((release) => release.isPrerelease === true),
  );

  if (stableRelease === null) {
    return prerelease;
  }

  if (prerelease === null) {
    return stableRelease;
  }

  return compareReleaseRecency(prerelease, stableRelease) > 0
    ? prerelease
    : stableRelease;
}
