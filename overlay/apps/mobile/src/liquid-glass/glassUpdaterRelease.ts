export const DEFAULT_GLASS_RELEASE_REPO = "abotmaker/t3-frosted-glass";

const ALLOWED_RELEASE_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

export interface GlassReleaseUpdate {
  readonly tagName: string;
  readonly versionName: string;
  readonly versionCode: number;
  readonly upstreamSha: string | null;
  readonly downloadUrl: string;
  readonly fileName: string;
  readonly expectedSha256: string | null;
  readonly sizeBytes: number | null;
}

interface GitHubReleaseAsset {
  readonly name?: unknown;
  readonly browser_download_url?: unknown;
  readonly size?: unknown;
  readonly digest?: unknown;
}

interface GitHubReleasePayload {
  readonly tag_name?: unknown;
  readonly name?: unknown;
  readonly body?: unknown;
  readonly draft?: unknown;
  readonly prerelease?: unknown;
  readonly assets?: unknown;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function isTrustedReleaseDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:" && ALLOWED_RELEASE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeSha256Hex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^sha256:/i, "").toLowerCase();
  return SHA256_PATTERN.test(cleaned) ? cleaned : null;
}

export function parseGitHubGlassRelease(
  payload: unknown,
  installedVersionCode: number,
  installedUpstreamSha: string | null = null,
): GlassReleaseUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const release = payload as GitHubReleasePayload;
  if (release.draft === true || release.prerelease === true) return null;

  const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
  if (!tagName) return null;

  const assets = Array.isArray(release.assets) ? (release.assets as GitHubReleaseAsset[]) : [];
  const apkAsset =
    assets.find(
      (asset) =>
        typeof asset?.name === "string" &&
        asset.name.toLowerCase().endsWith(".apk") &&
        typeof asset.browser_download_url === "string" &&
        isTrustedReleaseDownloadUrl(asset.browser_download_url),
    ) ?? null;
  if (!apkAsset || typeof apkAsset.name !== "string" || typeof apkAsset.browser_download_url !== "string") {
    return null;
  }

  const body = typeof release.body === "string" ? release.body : "";
  const bodyVersionCode = /\bVersionCode:\s*(\d+)/i.exec(body)?.[1];
  const tagVersionCode = /-glass\.(\d+)(?:-|$)/i.exec(tagName)?.[1];
  const versionCode = Number.parseInt(bodyVersionCode ?? tagVersionCode ?? "", 10);
  if (!Number.isFinite(versionCode) || versionCode <= 0) return null;

  const bodySha = /\bUpstreamCommit:\s*([0-9a-f]{7,40})\b/i.exec(body)?.[1]?.toLowerCase() ?? null;
  const tagSha = /-glass\.\d+-([0-9a-f]{7,40})$/i.exec(tagName)?.[1]?.toLowerCase() ?? null;
  const upstreamSha = bodySha ?? tagSha;

  if (versionCode <= installedVersionCode) return null;

  if (
    installedVersionCode > 1 &&
    upstreamSha &&
    installedUpstreamSha &&
    installedUpstreamSha.toLowerCase().startsWith(upstreamSha.slice(0, 7)) &&
    versionCode <= installedVersionCode
  ) {
    return null;
  }

  const expectedSha256 =
    normalizeSha256Hex(apkAsset.digest) ??
    normalizeSha256Hex(/\bSHA256:\s*([0-9a-f]{64})\b/i.exec(body)?.[1]);
  const versionName =
    /^v?(\d+\.\d+\.\d+)/i.exec(tagName)?.[1] ??
    (typeof release.name === "string" ? release.name.trim() : tagName);

  return {
    tagName,
    versionName,
    versionCode,
    upstreamSha,
    downloadUrl: apkAsset.browser_download_url.trim(),
    fileName: apkAsset.name.trim(),
    expectedSha256,
    sizeBytes: typeof apkAsset.size === "number" && apkAsset.size > 0 ? apkAsset.size : null,
  };
}
