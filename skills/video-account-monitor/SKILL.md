---
name: video-account-monitor
description: Use when monitoring creator/video accounts on Bilibili, Douyin, Kuaishou, or Xiaohongshu, especially for account URLs, browser login sessions, follower counts, video counts, likes, views, comments, per-video metrics, HTML dashboards, JSON exports, or CSV tables.
---

# Video Account Monitor

Collect creator-account metrics into one schema and export `summary.json`, `videos.json`, `videos.csv`, and `report.html`. By default, each platform collects the latest 200 videos unless `--limit` is provided. The required per-video fields are `likes`, `views`, and `comments`.

## Install

Run from this skill directory:

```bash
npm install
```

The first install also pulls in `playwright-extra` and `puppeteer-extra-plugin-stealth` for stealth mode.

Real collection for every platform opens a visible Playwright browser session. `npm install` installs the Playwright package declared by this skill, and the collector launches local Google Chrome by default. Install Chrome on the machine before real collection.

**Xiaohongshu requires Python for signed API collection.** Without Python, collection falls back to browser scroll mode and comment/detail metrics will be unavailable.

Install Python if not already available:
- **Windows**: download from https://www.python.org/downloads/ and check "Add Python to PATH" during install, or use Anaconda/Miniconda
- **macOS/Linux**: `brew install python3` or use the system package manager

Then install the signing dependency using the same Python interpreter that will be set as `XHS_PYTHON`:

```bash
/path/to/python -m pip install -r requirements.txt
```

Set `XHS_PYTHON` to the absolute path of your Python interpreter before running Xiaohongshu signed API collection:

- **Windows (Python from python.org)**: `XHS_PYTHON="C:/Users/YourName/AppData/Local/Programs/Python/Python312/python.exe"`
- **Windows (Anaconda)**: `XHS_PYTHON="C:/Users/YourName/anaconda3/python.exe"`
- **macOS/Linux**: `XHS_PYTHON="/usr/bin/python3"` or `XHS_PYTHON="/opt/homebrew/bin/python3"`

```bash
XHS_PYTHON="/path/to/python" node scripts/monitor.mjs --platform xiaohongshu --account "ACCOUNT_URL_OR_ID" --profile ./private/profiles/xiaohongshu --out ./outputs/account
```

## Quick Start

Run from this skill directory:

```bash
node scripts/monitor.mjs --platform bilibili --account "https://space.bilibili.com/470995011" --out ./outputs/caiyaqi
```

Demo without network:

```bash
npm run demo
```

With a user-controlled browser login session:

```bash
node scripts/monitor.mjs --platform kuaishou --account "ACCOUNT_URL_OR_ID" --profile ./private/profiles/kuaishou --out ./outputs/account
```

Real collection always opens a visible browser login session. The CLI reuses the chosen browser profile on later runs. If Chrome is not available, install Google Chrome first, or change the browser launch configuration in `scripts/monitor.mjs` to a locally installed Playwright browser.

### CDP Mode (Recommended for Kuaishou repeat runs)

CDP mode lets the skill reuse your already-logged-in Chrome via Chrome DevTools Protocol. This is the recommended way to run Kuaishou collection repeatedly, because the freshly opened browser no longer needs a QR-code scan.

1. Close every Chrome window on the machine.
2. Start Chrome with the remote debugging port enabled (use the user-data-dir you normally use, so the existing login cookies are kept):
   ```bash
   # Windows (PowerShell)
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 `
     --remote-debugging-address=127.0.0.1 `
     --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data"
   # macOS
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/Library/Application Support/Google/Chrome"
   # Linux
   google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/google-chrome"
   ```
3. In that Chrome, open `https://www.kuaishou.com` and confirm the account is logged in.
4. Run the skill with `--cdp`:
   ```bash
   node scripts/monitor.mjs --platform kuaishou \
     --account "https://www.kuaishou.com/profile/3xtp53m9rrnfs34" \
     --cdp http://127.0.0.1:9222 \
     --out ./outputs/kuaishou_3xtp53m9rrnfs34
   ```

The skill will attach to the existing Chrome session, read the `passToken` cookie, and run the GraphQL/REST requests in your browser context. The skill will not call `browser.close()` on the CDP-attached browser, so your Chrome keeps running after the run.

If port 9222 is already in use, run `netstat -ano | findstr 9222` (Windows) or `lsof -i :9222` (macOS/Linux) to find the conflicting process, then pick a different port (e.g. `--remote-debugging-port=9333` and `--cdp http://127.0.0.1:9333`).

### Stealth Mode (Recommended for Kuaishou)

The skill wraps Playwright with `playwright-extra` and the `puppeteer-extra-plugin-stealth` plugin to hide `navigator.webdriver`, canvas/TLS fingerprint differences, and other automation markers that Kuaishou's risk control watches for. Stealth is enabled by default; pass `--no-stealth` to opt out.

Stealth is applied to both `--profile` (independent profile) and `--cdp` modes. In CDP mode, stealth is best-effort because the page is rendered by your own Chrome — what helps most is having a real logged-in session.

## Platform Status

The skill accepts all four platforms through the same CLI and output schema. Native collection status is:

| Platform | Native Adapter | Notes |
|---|---:|---|
| Bilibili | implemented | Uses public web APIs plus optional cookies/browser auth. Risk-control can still interrupt large accounts. |
| Douyin | implemented | Uses a_bogus signing (douyin.js). Requires cookies with msToken or browser auth. |
| Kuaishou | implemented | GraphQL POST + REST profile/feed. Supports cookies/browser auth. Stealth plugin enabled by default. Tries the profile video list first; if that endpoint is risk-controlled, falls back to creator-name search and exact author-id filtering. Per-video comment count is fetched via the `visionVideoComment` GraphQL query with concurrency 4 for any row that initially came back with `comments === 0`. |
| Xiaohongshu | implemented | Uses visible browser login plus xhshow Python signing. Creator-note list can collect 200 rows by default; detail metrics are fetched for up to 200 rows. Public web data does not reliably expose views. |

## Authentication

Use only user-controlled browser sessions for real collection. Never ask for passwords, SMS codes, raw cookies, or credentials. Do not commit cookies, browser profiles, exported reports containing private data, or `.env` files.

Real collection opens a visible Playwright Chrome profile, lets the user log in manually, and exports cookies from that profile for the native adapters. The required Node dependency is installed by `npm install` from this package.

`--profile` should point to a dedicated browser profile under `./private/`, not a daily-use browser profile. User-provided `--cookies`, `--auth cookie`, and `--auth none` are intentionally unsupported. If scan login, captcha, or risk-control appears, the user must complete it manually in the opened browser; do not automate or bypass verification. Do not route collection through MediaCrawler or another external crawler backend for this skill; implement platform behavior in the native adapter files under `scripts/adapters/`.

Do not share `private/`, `outputs/`, `node_modules/`, `__pycache__/`, `.env`, raw cookies, browser profiles, or generated reports containing private account data.

## Output Contract

Every adapter must return:

```json
{
  "account": {
    "platform": "bilibili",
    "id": "470995011",
    "url": "https://space.bilibili.com/470995011",
    "name": "Creator",
    "followers": 0,
    "videoCount": 0,
    "totalLikes": 0,
    "totalViews": 0,
    "totalComments": 0
  },
  "videos": [
    {
      "id": "VIDEO_ID",
      "title": "Title",
      "url": "https://...",
      "publishedAt": "2026-05-25T00:00:00+08:00",
      "duration": "03:21",
      "likes": 0,
      "views": 0,
      "comments": 0,
      "shares": 0,
      "favorites": 0,
      "coins": 0
    }
  ]
}
```

`comments` is mandatory in JSON, CSV, and HTML. If a platform cannot expose comments for a row, output `0` or leave the adapter blocked with a clear auth/risk-control error; do not silently omit the column.

## Common Failures

- `Bilibili risk-control response`: retry later, reduce `--limit`, or use browser login with the saved profile.
- Kuaishou `collectionStatus: "partial"`: the profile video-list GraphQL endpoint was unavailable or risk-controlled, so the adapter used creator-name search with exact author-id filtering. This can produce per-video rows, but it is not a complete account archive.
- CSV looks garbled in Excel: the script writes UTF-8 with BOM; reopen the generated `videos.csv`.

## Verification

Before claiming the skill works, run:

```bash
node scripts/monitor.test.mjs
node scripts/monitor.mjs --demo --out ./outputs/demo
```
