// ── UA rotation pool ─────────────────────────────────────────────────
const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
];

// ── GraphQL queries (from bendi.monitor) ─────────────────────────────
const VISION_PROFILE_QUERY = `query visionProfile($userId: String) {
  visionProfile(userId: $userId) {
    result
    hostName
    userProfile {
      ownerCount { fan photo follow photo_public __typename }
      profile { gender user_name user_id headurl user_text user_profile_bg_url __typename }
      isFollowing
      __typename
    }
    __typename
  }
}`;

const PHOTO_FEED_FRAGMENT = `fragment photoContent on PhotoEntity {
  __typename
  id
  duration
  caption
  originCaption
  likeCount
  viewCount
  commentCount
  realLikeCount
  coverUrl
  photoUrl
  photoH265Url
  manifest
  manifestH265
  videoResource
  coverUrls { url __typename }
  timestamp
  expTag
  animatedCoverUrl
  distance
  videoRatio
  liked
  stereoType
  profileUserTopPhoto
  musicBlocked
  riskTagContent
  riskTagUrl
}
fragment recoPhotoFragment on recoPhotoEntity {
  __typename
  id
  duration
  caption
  originCaption
  likeCount
  viewCount
  commentCount
  realLikeCount
  coverUrl
  photoUrl
  photoH265Url
  manifest
  manifestH265
  videoResource
  coverUrls { url __typename }
  timestamp
  expTag
  animatedCoverUrl
  distance
  videoRatio
  liked
  stereoType
  profileUserTopPhoto
  musicBlocked
  riskTagContent
  riskTagUrl
}
fragment feedContent on Feed {
  type
  author {
    id
    name
    headerUrl
    following
    headerUrls { url __typename }
    __typename
  }
  photo {
    ...photoContent
    ...recoPhotoFragment
    __typename
  }
  canAddComment
  llsid
  status
  currentPcursor
  tags { type name __typename }
  __typename
}`;

const VISION_PROFILE_PHOTO_LIST_QUERY = `${PHOTO_FEED_FRAGMENT}
query visionProfilePhotoList($pcursor: String, $userId: String, $page: String, $webPageArea: String) {
  visionProfilePhotoList(pcursor: $pcursor, userId: $userId, page: $page, webPageArea: $webPageArea) {
    result
    llsid
    webPageArea
    feeds { ...feedContent __typename }
    hostName
    pcursor
    __typename
  }
}`;

const VISION_SEARCH_PHOTO_QUERY = `${PHOTO_FEED_FRAGMENT}
query visionSearchPhoto($keyword: String, $pcursor: String, $searchSessionId: String, $page: String, $webPageArea: String) {
  visionSearchPhoto(keyword: $keyword, pcursor: $pcursor, searchSessionId: $searchSessionId, page: $page, webPageArea: $webPageArea) {
    result
    feeds { ...feedContent __typename }
    searchSessionId
    pcursor
    __typename
  }
}`;

const VISION_VIDEO_COMMENT_QUERY = `query commentListQuery($photoId: String, $pcursor: String) {
  visionCommentList(photoId: $photoId, pcursor: $pcursor) {
    commentCount
    commentCountV2
    pcursor
    pcursorV2
    __typename
  }
}`;

// ── Shared helpers (jitter/sleep/toIso/parseMetric/formatDuration live in _shared/util.mjs) ──
import { jitter, sleep, toIso, parseMetric, formatDuration, dedupeById, buildAccountSummary, redactSensitiveText } from "./_shared/util.mjs";

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function extractUserId(account) {
  const text = String(account);
  // https://www.kuaishou.com/profile/3x4jtnbfter525a
  const match = text.match(/kuaishou\.com\/profile\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // https://live.kuaishou.com/u/{userId}
  const liveMatch = text.match(/live\.kuaishou\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (liveMatch) return liveMatch[1];
  // Pure ID
  if (/^[a-zA-Z0-9_-]+$/.test(text)) return text;
  throw new Error("Could not find Kuaishou user ID in account URL or id.");
}

function buildHeaders(cookieHeader) {
  const ua = randItem(UA_POOL);
  const did = extractCookieValue(cookieHeader, "did") || generateWebDid();
  return {
    "user-agent": ua,
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json;charset=UTF-8",
    origin: "https://www.kuaishou.com",
    referer: "https://www.kuaishou.com/profile/unknown",
    "sec-ch-ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": ua.includes("Mac") ? '"macOS"' : '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    kpf: "PC_WEB",
    kpn: "KUAISHOU_VISION",
    did,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function extractCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = cookieHeader.match(re);
  return match ? decodeURIComponent(match[1]) : null;
}

function generateWebDid() {
  const bytes = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `web_${hex}`;
}

// ── Risk-control circuit breaker ──────────────────────────────────────
// Resets on any successful GraphQL response. After RISK_ABORT_THRESHOLD consecutive
// 412/403/421 HTTP statuses or `data.errors` responses, the next call throws
// `RiskControlAbort` instead of retrying. Keeps a sustained ban from burning
// `200 × 5 retries × ~3s backoff = 50 min` of stuck collection.
const RISK_ABORT_THRESHOLD = 5;
let consecutiveRiskControl = 0;

class RiskControlAbort extends Error {
  constructor(detail) {
    // Accept either a count (legacy) or a descriptive string. Produces a clear
    // message for the caller regardless of which path triggered the abort.
    const tail = typeof detail === "number"
      ? `${detail} consecutive 412/403/421 responses`
      : String(detail);
    super(`Kuaishou risk control abort: ${tail}.`);
    this.name = "RiskControlAbort";
  }
}

// ── Request with retry + exponential backoff ──────────────────────────
async function graphqlPost(operationName, variables, query, referer, cookieHeader = "", retries = 5) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const headers = buildHeaders(cookieHeader);
      headers.referer = referer;
      const body = JSON.stringify({ operationName, variables, query });
      const response = await fetch("https://www.kuaishou.com/graphql", {
        method: "POST",
        headers,
        body,
      });

      if (response.status === 412 || response.status === 403 || response.status === 421) {
        consecutiveRiskControl += 1;
        if (consecutiveRiskControl >= RISK_ABORT_THRESHOLD) {
          throw new RiskControlAbort(consecutiveRiskControl);
        }
        throw new Error(`HTTP ${response.status}: Kuaishou risk-control ban (retryable)`);
      }

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Kuaishou returned non-JSON status=${response.status}: ${text.slice(0, 90)} (retryable)`);
      }
      if (data.errors) {
        consecutiveRiskControl += 1;
        if (consecutiveRiskControl >= RISK_ABORT_THRESHOLD) {
          throw new RiskControlAbort(consecutiveRiskControl);
        }
        throw new Error(`Kuaishou GraphQL error: ${JSON.stringify(data.errors)} (retryable)`);
      }
      consecutiveRiskControl = 0;
      return data.data || {};
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        const base = 3000 * 2 ** attempt;
        await sleep(base);
      }
    }
  }
  throw lastError;
}

async function fetchCommentCount(photoId, cookieHeader, { page = null } = {}) {
  // Primary: GraphQL commentListQuery (fast, no navigation, works with cookies).
  try {
    const data = await graphqlPost(
      "commentListQuery",
      { photoId, pcursor: "" },
      VISION_VIDEO_COMMENT_QUERY,
      `https://www.kuaishou.com/short-video/${photoId}`,
      cookieHeader,
      2,
    );
    const list = data?.visionCommentList;
    const v2 = list?.commentCountV2;
    const v1 = list?.commentCount;
    const count = parseMetric(v2 ?? v1);
    if (count > 0) return { count, error: null };
  } catch (error) {
    if (!page) return { count: 0, error: `graphql: ${error.message || String(error)}` };
  }

  // Fallback: HTTP GET short-video page and parse Apollo state (only if a Playwright page is
  // available, since that carries the browser cookies).
  if (page) {
    const url = `https://www.kuaishou.com/short-video/${photoId}`;
    let response;
    try {
      response = await page.context().request.get(url, { timeout: 15000, headers: { accept: "text/html" } });
    } catch (error) {
      return { count: 0, error: `request failed: ${error.message || String(error)}` };
    }
    if (!response.ok()) {
      return { count: 0, error: `HTTP ${response.status()}` };
    }
    const html = await response.text();
    const tryMatchPatterns = [
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\})\s*[;<]/,
      /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]+?\})\s*[;<]/,
    ];
    for (const pattern of tryMatchPatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const state = JSON.parse(match[1]);
          const tryPaths = [
            () => state?.video?.commentCount,
            () => state?.photo?.commentCount,
            () => state?.visionVideoDetail?.commentCount,
            () => state?.visionPhotoDetail?.commentCount,
            () => {
              const map = state?.note?.noteDetailMap;
              if (map) {
                const first = Object.values(map)[0];
                return first?.note?.commentCount;
              }
              return null;
            },
          ];
          for (const fn of tryPaths) {
            const v = fn();
            if (typeof v === "number" && Number.isFinite(v) && v >= 0) return { count: v, error: null };
          }
        } catch {
          // fall through to next pattern
        }
      }
    }
    return { count: 0, error: "commentCount not found in HTML" };
  }

  return { count: 0, error: "no comment count available" };
}

async function backfillComments(videos, cookieHeader, { page = null, concurrency = 4, delay = 1500 } = {}) {
  const result = { updated: 0, errors: [] };
  if (!videos.length) return result;
  const targets = videos.filter((video) => video.id && video.comments === 0);
  if (!targets.length) return result;
  const byId = new Map(videos.map((video) => [String(video.id), video]));
  let index = 0;
  const worker = async () => {
    while (index < targets.length) {
      const myIndex = index;
      index += 1;
      const video = targets[myIndex];
      const { count, error } = await fetchCommentCount(video.id, cookieHeader, { page });
      if (error) {
        result.errors.push({ photoId: video.id, error });
      } else if (count > 0) {
        const target = byId.get(String(video.id));
        if (target) {
          target.comments = count;
          result.updated += 1;
        }
      }
      if (myIndex < targets.length - 1) {
        await sleep(delay);
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
  await Promise.all(workers);
  return result;
}

async function searchVideosByCreator({ userId, keyword, cookieHeader, limit, delay }) {
  if (!keyword) return [];

  const rawVideos = [];
  let pcursor = "1";
  let searchSessionId = "";
  const maxPages = limit ? Math.ceil(limit / 20) : 2;

  for (let pageCount = 0; pageCount < maxPages && pcursor !== "no_more"; pageCount += 1) {
    const pageData = await graphqlPost(
      "visionSearchPhoto",
      { keyword, pcursor, page: "search", searchSessionId },
      VISION_SEARCH_PHOTO_QUERY,
      "https://www.kuaishou.com/search/video",
      cookieHeader,
    );
    await sleep(delay);

    const result = pageData.visionSearchPhoto || {};
    if (result.result !== 1) break;

    searchSessionId = result.searchSessionId || searchSessionId;
    pcursor = result.pcursor || "no_more";

    for (const feed of result.feeds || []) {
      if (feed.author?.id === userId && feed.photo) {
        rawVideos.push({ ...feed.photo, author: feed.author });
      }
    }

    if (limit && rawVideos.length >= limit) break;
  }

  return rawVideos;
}

// ── Main collect function ────────────────────────────────────────────
function failAccount(userId, error) {
  return {
    account: buildAccountSummary({
      platform: "kuaishou",
      id: userId,
      url: userId ? `https://www.kuaishou.com/profile/${userId}` : "",
      collectionStatus: "failed",
      warnings: [`Kuaishou collection aborted: ${error?.message || String(error) || "unknown error"}`],
    }),
    videos: [],
  };
}

export async function collect({ account, cookieHeader = "", limit, delay = 5000 }) {
  let userId = "";
  try {
  userId = extractUserId(account);
  const profileUrl = `https://www.kuaishou.com/profile/${userId}`;

  // 1. Fetch creator profile
  const profileData = await graphqlPost(
    "visionProfile",
    { userId },
    VISION_PROFILE_QUERY,
    profileUrl,
    cookieHeader,
  );
  await sleep(delay);

  const warnings = [];
  let collectionStatus = "complete";
  const visionProfile = profileData.visionProfile || {};
  if (visionProfile.result !== 1) {
    collectionStatus = "partial";
    warnings.push(`Kuaishou profile unavailable for ${userId}: result=${visionProfile.result ?? "missing"}.`);
  }

  const userProfile = visionProfile.userProfile || {};
  const profile = userProfile.profile || {};
  const ownerCount = userProfile.ownerCount || {};

  const expectedVideoCount = parseMetric(ownerCount.photo_public ?? ownerCount.photo) ?? 0;

  // 2. Fetch videos (paginated)
  const rawVideos = [];
  let profileListUnavailable = false;
  let pcursor = "";
  let pageCount = 0;
  const maxPages = limit ? Math.ceil(limit / 20) : 50;

  while (pcursor !== "no_more" && pageCount < maxPages) {
    let pageData;
    try {
      pageData = await graphqlPost(
        "visionProfilePhotoList",
        { pcursor, userId, page: "profile" },
        VISION_PROFILE_PHOTO_LIST_QUERY,
        profileUrl,
        cookieHeader,
      );
    } catch (error) {
      profileListUnavailable = true;
      warnings.push(
        `Kuaishou profile video list unavailable for ${userId}: ${error.message || String(error)}. Falling back to search.`,
      );
      break;
    }
    await sleep(delay);

    const result = pageData.visionProfilePhotoList || {};
    pcursor = result.pcursor || "no_more";
    const feeds = result.feeds || [];
    if (pageCount === 0 && expectedVideoCount > 0 && feeds.length === 0 && result.result !== 1) {
      profileListUnavailable = true;
      warnings.push(
        `Kuaishou profile video list unavailable for ${userId}: result=${result.result ?? "missing"}, pcursor=${result.pcursor ?? "missing"}. Falling back to search.`,
      );
      break;
    }

    for (const feed of feeds) {
      if (feed.photo) {
        rawVideos.push({ ...feed.photo, author: feed.author });
      }
    }

    pageCount += 1;
    if (limit && rawVideos.length >= limit) break;
  }

  if (rawVideos.length === 0) {
    try {
      rawVideos.push(...await searchVideosByCreator({
        userId,
        keyword: profile.user_name,
        cookieHeader,
        limit,
        delay,
      }));
    } catch (error) {
      warnings.push(`Kuaishou search fallback failed for ${userId}: ${error.message || String(error)}.`);
    }
  }

  if (profileListUnavailable) {
    collectionStatus = "partial";
  }

  if (rawVideos.length === 0 && expectedVideoCount > 0) {
    collectionStatus = "partial";
    warnings.push("Kuaishou collected account metrics, but no per-video rows were available.");
  }

  // 3. Deduplicate and limit
  const uniqueVideos = dedupeById(rawVideos, (v) => v.id, limit || undefined);

  // 4. Map to output schema (parseMetric returns null for unparseable, so default each to 0)
  const videos = uniqueVideos.map((video) => ({
    id: String(video.id || ""),
    title: video.caption || "",
    url: `https://www.kuaishou.com/short-video/${video.id}`,
    publishedAt: toIso(video.timestamp),
    duration: formatDuration(video.duration),
    likes: parseMetric(video.realLikeCount ?? video.likeCount) ?? 0,
    views: parseMetric(video.viewCount) ?? 0,
    comments: parseMetric(video.commentCount) ?? 0,
    shares: 0,
    favorites: 0,
    coins: 0,
  }));

  // 5. Backfill comment counts (only rows where comments === 0 or null)
  try {
    const backfill = await backfillComments(videos, cookieHeader, { concurrency: 4, delay });
    if (backfill.errors.length) {
      warnings.push(
        `Kuaishou comment backfill: ${backfill.updated} updated, ${backfill.errors.length} failed for ${userId}. First error: ${backfill.errors[0].error}.`,
      );
    }
  } catch (error) {
    warnings.push(`Kuaishou comment backfill failed for ${userId}: ${error.message || String(error)}.`);
  }

  return {
    account: buildAccountSummary({
      platform: "kuaishou",
      id: userId,
      url: profileUrl,
      name: profile.user_name || "",
      followers: parseMetric(ownerCount.fan) ?? 0,
      videoCount: expectedVideoCount || videos.length,
      totalLikes: videos.reduce((sum, v) => sum + v.likes, 0),
      totalViews: videos.reduce((sum, v) => sum + v.views, 0),
      totalComments: videos.reduce((sum, v) => sum + v.comments, 0),
      collectionStatus,
      warnings,
    }),
    videos,
  };
  } catch (error) {
    console.log(`Kuaishou collect failed: ${error?.message || String(error)}.`);
    return failAccount(userId, error);
  }
}

export async function collectWithBrowser({ account, context, page, cookieHeader = "", limit = 200, delay = 3000 }) {
  let userId = "";
  try {
  userId = extractUserId(account);
  const profileUrl = `https://www.kuaishou.com/profile/${userId}`;

  const collectedVideos = new Map();
  let creatorName = "";
  let creatorFans = 0;

  // Use GraphQL visionProfile to get the real fan/name/photo_public values when the viewer is
  // logged in. The /rest/v/profile/get endpoint returns a public "1 fan" view for non-owners
  // and is no longer authoritative.

  // Register response interception BEFORE navigation so we capture the profile/feed call.
  let sawEndCursor = false;
  const responseHandler = async (response) => {
    try {
      const url = response.url();
      if (!url.includes("kuaishou.com")) return;
      if (url.includes("/rest/v/profile/get")) {
        const json = await response.json().catch(() => null);
        if (json?.result === 1 && json.fans > 0 && !creatorFans) {
          creatorName = creatorName || json.userName || "";
          creatorFans = parseMetric(json.fans) ?? 0;
        }
      }
      if (url.includes("/rest/v/profile/feed")) {
        const json = await response.json().catch(() => null);
        if (!json || json.result !== 1) return;
        console.log(`Kuaishou REST profile/feed: ${json.feeds?.length ?? 0} items, pcursor=${json.pcursor || "end"}`);
        for (const feed of json.feeds || []) {
          if (feed.photo?.id) {
            collectedVideos.set(String(feed.photo.id), feed.photo);
            // Extract creator name from the first feed's author field
            if (!creatorName && feed.author?.name) creatorName = feed.author.name;
          }
        }
        if (json.pcursor === "no_more") sawEndCursor = true;
      }
    } catch {}
  };

  page.on("response", responseHandler);
  if (context) context.on("response", responseHandler);

  // Parallelize: fire GraphQL visionProfile while the page navigates. Saves ~1-2s on
  // a typical run. We await the profile call after page.goto so the call is bounded.
  // Track a definitive "invalid userId" or "circuit-broken" signal so we can fast-fail
  // (skip the 10-minute login wait) instead of pretending the run succeeded.
  let visionProfileInvalid = null;
  const profilePromise = graphqlPost("visionProfile", { userId }, VISION_PROFILE_QUERY, profileUrl, cookieHeader, 2)
    .then((profileData) => {
      const visionProfile = profileData.visionProfile || {};
      const userProfile = visionProfile.userProfile || {};
      const ownerCount = userProfile.ownerCount || {};
      const profile = userProfile.profile || {};
      if (visionProfile.result === 1) {
        creatorName = creatorName || profile.user_name || "";
        creatorFans = parseMetric(ownerCount.fan) ?? creatorFans;
        console.log(`Kuaishou GraphQL visionProfile: fan=${ownerCount.fan ?? "?"}, name=${profile.user_name || "?"}, photo_public=${ownerCount.photo_public ?? "?"}.`);
      } else {
        // Server returned a real error code (not 412/403/421, not network). The most
        // common cause is a typo'd / banned userId; no amount of waiting helps.
        visionProfileInvalid = new RiskControlAbort(`visionProfile result=${visionProfile.result} for userId=${userId} (likely invalid or banned)`);
        console.log(`Kuaishou GraphQL visionProfile: result=${visionProfile.result} → marking invalid.`);
      }
    })
    .catch((error) => {
      console.log(`Kuaishou GraphQL visionProfile failed: ${error.message || String(error)}. Falling back to REST interception.`);
      if (error?.name === "RiskControlAbort") {
        // Circuit-breaker hit (5 consecutive 412/403/421). Don't waste 10 min waiting —
        // the IP is banned from Kuaishou GraphQL, not the user.
        visionProfileInvalid = error;
      }
    });

  try {
    await page.goto("https://www.kuaishou.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch {
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);
  await profilePromise;

  // Fast-fail: skip the 10-min login wait if visionProfile already proved the userId is
  // unreachable (typo / banned) or the IP is circuit-broken. Top-level try/catch turns
  // this into collectionStatus="failed".
  if (visionProfileInvalid) {
    throw visionProfileInvalid;
  }

  const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) || "").catch(() => "");
  const serverError = /服务器异常|server.*error|请稍后再试/i.test(pageText);
  const needsLogin = /扫码登录|请登录|二维码/i.test(pageText);
  if (serverError || needsLogin) {
    const msg = serverError
      ? "当前登录账号被限制访问此主页（服务器异常）。请在浏览器中切换/扫码登录其他快手账号"
      : "Kuaishou login required. Please scan QR code in the browser";
    console.log(`${msg}. Waiting up to 10 minutes...`);
    if (serverError) {
      await context.clearCookies();
      await page.goto("https://www.kuaishou.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    }
    const deadline = Date.now() + 10 * 60 * 1000;
    let loggedIn = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(4000);
      const cookies = await context.cookies(["https://www.kuaishou.com"]).catch(() => []);
      const passToken = cookies.find((c) => c.name === "passToken");
      if (passToken?.value?.length > 40) {
        await page.waitForTimeout(3000);
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(5000);
        loggedIn = true;
        break;
      }
    }
    if (!loggedIn) {
      // Don't silently fall back to HTTP — that would return collectionStatus="partial"
      // with 0 videos, a stability lie. The user wasn't logged in and the browser path
      // can't proceed. Surface as "failed" so the caller knows the run was unproductive.
      console.log("Kuaishou: login wait timed out; aborting.");
      throw new RiskControlAbort(`login wait timed out after 10 min for userId=${userId}`);
    }
  }

  const viewport = page.viewportSize() || { width: 1280, height: 900 };
  await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 3)).catch(() => {});

  // Break early if REST feed already returned pcursor=no_more (small accounts), or after
  // 2 stable scrolls (down from 4). Reduces wasted scroll time on small accounts.
  const maxScrolls = Math.max(24, Math.ceil((limit || 200) / 8) + 10);
  let lastCount = 0;
  let stableScrolls = 0;
  for (let scroll = 0; scroll < maxScrolls && collectedVideos.size < (limit || 200); scroll += 1) {
    try { await page.mouse.wheel(0, 800); } catch { break; }
    try { await page.waitForTimeout(delay); } catch { break; }
    if (sawEndCursor) {
      console.log(`Kuaishou browser collect: REST feed returned pcursor=no_more after ${scroll + 1} scrolls (${collectedVideos.size} videos).`);
      break;
    }
    if (collectedVideos.size === lastCount) {
      stableScrolls += 1;
    } else {
      stableScrolls = 0;
      lastCount = collectedVideos.size;
    }
    console.log(`Kuaishou browser collect: ${collectedVideos.size} video(s), scroll ${scroll + 1}/${maxScrolls}.`);
    if (stableScrolls >= 2) break;
  }

  if (collectedVideos.size === 0) {
    console.log("Kuaishou browser interception collected no videos; falling back to HTTP collection.");
    return collect({ account, cookieHeader, limit, delay });
  }

  if (!creatorName) {
    creatorName = await page.evaluate(() => {
      const el = document.querySelector("h1, [class*='name'], [class*='userName']");
      return el?.textContent?.trim() || "";
    }).catch(() => "");
  }

  const uniqueVideos = Array.from(collectedVideos.values()).slice(0, limit || undefined);
  const videos = uniqueVideos.map((photo) => ({
    id: String(photo.id || ""),
    title: photo.caption || "",
    url: `https://www.kuaishou.com/short-video/${photo.id}`,
    publishedAt: toIso(photo.timestamp),
    duration: formatDuration(photo.duration),
    likes: parseMetric(photo.realLikeCount ?? photo.likeCount) ?? 0,
    views: parseMetric(photo.viewCount) ?? 0,
    comments: parseMetric(photo.commentCount) ?? 0,
    shares: 0,
    favorites: 0,
    coins: 0,
  }));

  // Backfill comment counts that were missing in the REST interception. Use the browser
  // context's request (carries the same cookies) to GET /short-video/{photoId} and parse
  // commentCount from window.__INITIAL_STATE__ in the response HTML. Avoids ERR_ABORTED
  // that page.goto would trigger under concurrent navigations.
  const warnings = [];
  let collectionStatus = "complete";
  try {
    const backfill = await backfillComments(videos, cookieHeader, { page, concurrency: 4, delay });
    if (backfill.errors.length) {
      console.log(
        `Kuaishou browser comment backfill: ${backfill.updated} updated, ${backfill.errors.length} failed. First error: ${backfill.errors[0].error}.`,
      );
      warnings.push(
        `Kuaishou comment backfill: ${backfill.updated}/${backfill.updated + backfill.errors.length} updated for ${userId}. First error: ${backfill.errors[0].error}.`,
      );
      collectionStatus = "partial";
    } else if (backfill.updated > 0) {
      console.log(`Kuaishou browser comment backfill: ${backfill.updated} updated.`);
    }
  } catch (error) {
    console.log(`Kuaishou browser comment backfill failed: ${error.message || String(error)}.`);
    warnings.push(`Kuaishou comment backfill failed for ${userId}: ${error.message || String(error)}.`);
    collectionStatus = "partial";
  }

  return {
    account: buildAccountSummary({
      platform: "kuaishou",
      id: userId,
      url: profileUrl,
      name: creatorName,
      followers: creatorFans,
      videoCount: videos.length,
      totalLikes: videos.reduce((sum, v) => sum + v.likes, 0),
      totalViews: videos.reduce((sum, v) => sum + v.views, 0),
      totalComments: videos.reduce((sum, v) => sum + v.comments, 0),
      collectionStatus,
      warnings,
    }),
    videos,
  };
  } catch (error) {
    console.log(`Kuaishou collectWithBrowser failed: ${error?.message || String(error)}.`);
    return failAccount(userId, error);
  }
}