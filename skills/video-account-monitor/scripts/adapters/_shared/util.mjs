// Shared utilities for video-account-monitor adapters.
// Designed so a single platform-specific adapter can `import { ... } from "./_shared/util.mjs"`
// without pulling in the other 3 adapters. Anything platform-specific (UA pool per platform,
// platform-specific headers, signing helpers) stays in the adapter file.

const CN_OFFSET_MS = 8 * 3600 * 1000;

/**
 * Returns base ±30% random. Used to spread retry / sleep timing to avoid risk-control clustering.
 */
export function jitter(base) {
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

/**
 * Sleep for `ms` ± 30% jitter. Pass `raw: true` to disable jitter for backoff loops that
 * already compute their own exact value.
 */
export function sleep(ms, { raw = false } = {}) {
  const actual = raw ? Math.round(ms) : jitter(ms);
  return new Promise((resolve) => setTimeout(resolve, actual));
}

/**
 * Convert a unix timestamp to a Beijing (+08:00) ISO string.
 * By default, auto-detects seconds vs milliseconds from string length (<= 10 chars = seconds).
 * Pass `detectMs: false` to treat input strictly as milliseconds.
 * Returns "" for falsy / non-finite input.
 */
export function toIso(ts, { detectMs = true } = {}) {
  if (!ts) return ""; // 0 / null / undefined / "" all become ""
  const num = Number(ts);
  if (!Number.isFinite(num)) return "";
  const ms = detectMs && String(ts).length <= 10 ? num * 1000 : num;
  return new Date(ms + CN_OFFSET_MS).toISOString().replace(".000Z", "+08:00");
}

/**
 * Parse a metric like "1.2万" / "3亿" / "42" to a number.
 * Returns null for "no data / unparseable" so callers can distinguish from a real 0.
 * Callers should default to 0 with `?? 0` or `|| 0` when the count is required.
 */
export function parseMetric(value, { extraMultipliers = {} } = {}) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim().replace(/,/g, "");
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)(万|亿|k|K|m|M|b|B)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = match[2];
  if (!unit) return n;
  if (unit === "万") return Math.round(n * 10000);
  if (unit === "亿") return Math.round(n * 1e8);
  if (extraMultipliers[unit] !== undefined) return Math.round(n * extraMultipliers[unit]);
  return n;
}

/**
 * Format a duration given in milliseconds as "MM:SS" or "HH:MM:SS" if >= 1 hour.
 * Returns "" for falsy input.
 */
export function formatDuration(ms) {
  if (!ms) return "";
  const totalSeconds = Math.floor(Number(ms) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Dedupe a list of items by a key, preserving order, with an optional limit.
 */
export function dedupeById(list, getKey, limit) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const k = String(getKey(item) ?? "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (limit && out.length >= limit) break;
  }
  return out;
}

/**
 * Redact sensitive tokens (xsec_token, platform cookies) from arbitrary text so that
 * generated reports don't leak credentials.
 */
export function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/([?&]xsec_token=)[^&\s)]+/gi, "$1REDACTED")
    .replace(/(%3[FfAa]|[?&,\s\{\[])(xsec_token)(%3[Dd]|=)([^&\s,\}\]]+)/gi, "$1$2$3REDACTED")
    .replace(/(["']xsec_token["']\s*:\s*["'])[^"']+/gi, "$1REDACTED")
    .replace(/(Cookie\s*:\s*)[^\r\n]+/gi, "$1REDACTED")
    .replace(/\b(a1|web_session|sessionid|sid_guard|uid_tt|msToken)=([^;,\s]+)/gi, "$1=REDACTED");
}

/**
 * Build the standard `account` block for the output dataset.
 * All adapter `collect` and `collectWithBrowser` functions should return this shape
 * (plus a `videos` array). `videos` are the per-video rows mapped by the adapter.
 */
export function buildAccountSummary({
  platform,
  id,
  url,
  name = "",
  followers = 0,
  videoCount = 0,
  totalLikes = 0,
  totalViews = 0,
  totalComments = 0,
  collectionStatus = "complete",
  warnings = [],
  fetchedAt = new Date().toISOString(),
}) {
  return {
    platform: String(platform || ""),
    id: String(id || ""),
    url: String(url || ""),
    name: String(name || ""),
    followers: Number(followers) || 0,
    videoCount: Number(videoCount) || 0,
    totalLikes: Number(totalLikes) || 0,
    totalViews: Number(totalViews) || 0,
    totalComments: Number(totalComments) || 0,
    collectionStatus: String(collectionStatus || "complete"),
    warnings: Array.isArray(warnings) ? warnings.map((w) => String(w)) : [],
    fetchedAt,
  };
}

/**
 * Map a raw platform-specific photo/aweme/archive to the standard output video row.
 * `extractors` is a dict of functions from `raw` → value; pass only the fields the platform exposes.
 * Missing extractors default to 0 / "".
 */
export function mapRawVideo(raw, account, extractors) {
  const safe = (fn, fallback) => {
    try {
      const v = fn ? fn(raw) : undefined;
      return v === undefined || v === null ? fallback : v;
    } catch {
      return fallback;
    }
  };
  return {
    platform: account.platform,
    accountId: account.id,
    accountName: account.name,
    id: String(safe(extractors.id, "")),
    title: String(safe(extractors.title, "")),
    url: redactSensitiveText(String(safe(extractors.url, ""))),
    publishedAt: toIso(safe(extractors.publishedAt, "")),
    duration: String(safe(extractors.duration, "")),
    likes: Number(safe(extractors.likes, 0)) || 0,
    views: Number(safe(extractors.views, 0)) || 0,
    comments: Number(safe(extractors.comments, 0)) || 0,
    shares: Number(safe(extractors.shares, 0)) || 0,
    favorites: Number(safe(extractors.favorites, 0)) || 0,
    coins: Number(safe(extractors.coins, 0)) || 0,
  };
}
