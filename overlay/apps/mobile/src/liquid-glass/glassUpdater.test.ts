import { describe, expect, it } from "vite-plus/test";

import {
  isTrustedReleaseDownloadUrl,
  normalizeSha256Hex,
  parseGitHubGlassRelease,
} from "./glassUpdaterRelease";

const VALID_SHA = "ed08cc2493ccbf8813b54310d883e2e9f5de636a22494375c7180c03b68e7164";

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: "v2.3.0-glass.29920100-b4277089",
    name: "T3 Frosted Glass 2.3.0 (b4277089)",
    draft: false,
    prerelease: false,
    body: [
      "UpstreamCommit: b4277089795299da077e784f9f3432b3cc1c1c7d",
      "VersionCode: 29920100",
      `SHA256: ${VALID_SHA}`,
    ].join("\n"),
    assets: [
      {
        name: "T3Code-Glass-b4277089-release.apk",
        browser_download_url:
          "https://github.com/abotmaker/t3-frosted-glass/releases/download/v2.3.0-glass.29920100-b4277089/T3Code-Glass-b4277089-release.apk",
        size: 62_000_000,
        digest: `sha256:${VALID_SHA}`,
      },
    ],
    ...overrides,
  };
}

describe("glassUpdater", () => {
  it("parses a newer GitHub Release with SHA-256 and versionCode", () => {
    const parsed = parseGitHubGlassRelease(makeRelease(), 29920000, "aaaaaaaa");
    expect(parsed).toEqual({
      tagName: "v2.3.0-glass.29920100-b4277089",
      versionName: "2.3.0",
      versionCode: 29920100,
      upstreamSha: "b4277089795299da077e784f9f3432b3cc1c1c7d",
      downloadUrl:
        "https://github.com/abotmaker/t3-frosted-glass/releases/download/v2.3.0-glass.29920100-b4277089/T3Code-Glass-b4277089-release.apk",
      fileName: "T3Code-Glass-b4277089-release.apk",
      expectedSha256: VALID_SHA,
      sizeBytes: 62_000_000,
    });
  });

  it("returns null when the installed build is already current or newer", () => {
    expect(parseGitHubGlassRelease(makeRelease(), 29920100, "b4277089")).toBeNull();
    expect(parseGitHubGlassRelease(makeRelease(), 29920200, "b4277089")).toBeNull();
  });

  it("ignores draft, prerelease, and untrusted download URLs", () => {
    expect(parseGitHubGlassRelease(makeRelease({ draft: true }), 1)).toBeNull();
    expect(parseGitHubGlassRelease(makeRelease({ prerelease: true }), 1)).toBeNull();
    expect(
      parseGitHubGlassRelease(
        makeRelease({
          assets: [
            {
              name: "evil.apk",
              browser_download_url: "https://evil.example.com/evil.apk",
            },
          ],
        }),
        1,
      ),
    ).toBeNull();
  });

  it("validates GitHub release URLs and SHA-256 digests", () => {
    expect(
      isTrustedReleaseDownloadUrl("https://github.com/abotmaker/t3-frosted-glass/releases/download/v1/a.apk"),
    ).toBe(true);
    expect(
      isTrustedReleaseDownloadUrl("https://objects.githubusercontent.com/assets/a.apk"),
    ).toBe(true);
    expect(isTrustedReleaseDownloadUrl("http://github.com/a/b/a.apk")).toBe(false);
    expect(isTrustedReleaseDownloadUrl("https://github.com.evil.test/a.apk")).toBe(false);
    expect(normalizeSha256Hex(`sha256:${VALID_SHA.toUpperCase()}`)).toBe(VALID_SHA);
    expect(normalizeSha256Hex("short")).toBeNull();
  });
});
