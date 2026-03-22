import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, "../../data/.cookies.json");

export interface TweetData {
  author: string;
  authorName: string;
  content: string;
  mediaUrls: string[];
  tweetDate: string | null;
  thread: string[];
}

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

async function createContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });

  // Load cookies if available
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
      await context.addCookies(cookies);
    } catch {
      // Ignore cookie loading errors
    }
  }

  return context;
}

/**
 * Normalize various X/Twitter URL formats to a canonical form
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  // twitter.com → x.com
  normalized = normalized.replace(/https?:\/\/(www\.)?twitter\.com/, "https://x.com");
  // mobile.twitter.com → x.com
  normalized = normalized.replace(/https?:\/\/mobile\.twitter\.com/, "https://x.com");
  // Remove tracking params
  const urlObj = new URL(normalized);
  urlObj.search = "";
  return urlObj.toString();
}

/**
 * Scrape a tweet's content using Playwright
 */
export async function scrapeTweet(url: string): Promise<TweetData> {
  const normalizedUrl = normalizeUrl(url);
  const context = await createContext();

  try {
    const page = await context.newPage();

    // Block unnecessary resources for speed
    await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,mp4,woff,woff2,ttf}", (route) =>
      route.abort()
    );

    await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for tweet content to render
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 }).catch(() => {
      // Fallback: wait for any article
      return page.waitForSelector("article", { timeout: 10000 });
    });

    // Small delay for dynamic content
    await page.waitForTimeout(2000);

    // Extract tweet data
    const data = await page.evaluate(() => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const mainArticle = articles[0];
      if (!mainArticle) throw new Error("No tweet article found");

      // Author handle
      const authorLink = mainArticle.querySelector('a[href*="/"] div[dir="ltr"] > span');
      const authorHandleEl = mainArticle.querySelector('a[tabindex="-1"] span');
      let author = "";
      if (authorHandleEl) {
        author = authorHandleEl.textContent?.replace("@", "") || "";
      }

      // Author name
      const authorNameEl = mainArticle.querySelector(
        'div[data-testid="User-Name"] a[role="link"] span'
      );
      const authorName = authorNameEl?.textContent || "";

      // Tweet text
      const tweetTextEl = mainArticle.querySelector('div[data-testid="tweetText"]');
      const content = tweetTextEl?.textContent || "";

      // Date
      const timeEl = mainArticle.querySelector("time");
      const tweetDate = timeEl?.getAttribute("datetime") || null;

      // Media URLs
      const mediaEls = mainArticle.querySelectorAll('img[src*="pbs.twimg.com"], video source');
      const mediaUrls: string[] = [];
      mediaEls.forEach((el) => {
        const src = el.getAttribute("src");
        if (src && !src.includes("profile_images") && !src.includes("emoji")) {
          mediaUrls.push(src);
        }
      });

      // Thread: get subsequent tweets from the same author
      const thread: string[] = [];
      for (let i = 1; i < articles.length; i++) {
        const art = articles[i];
        const handleEl = art.querySelector('a[tabindex="-1"] span');
        const handle = handleEl?.textContent?.replace("@", "") || "";
        if (handle === author) {
          const textEl = art.querySelector('div[data-testid="tweetText"]');
          if (textEl?.textContent) {
            thread.push(textEl.textContent);
          }
        } else {
          break; // Stop when a different author appears (replies from others)
        }
      }

      return { author, authorName, content, mediaUrls, tweetDate, thread };
    });

    return data;
  } finally {
    await context.close();
  }
}

/**
 * Try the oEmbed API first (lightweight, no auth needed for public tweets)
 */
export async function scrapeViaOembed(url: string): Promise<TweetData | null> {
  const normalizedUrl = normalizeUrl(url);
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const data = await res.json();
    // oEmbed returns HTML — extract text
    const htmlContent: string = data.html || "";
    // Strip HTML tags to get plain text
    const textContent = htmlContent
      .replace(/<blockquote[^>]*>/g, "")
      .replace(/<\/blockquote>/g, "")
      .replace(/<a[^>]*>(.*?)<\/a>/g, "$1")
      .replace(/<p[^>]*>(.*?)<\/p>/g, "$1\n")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&mdash;.*$/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const authorMatch = data.author_name;
    const authorUrl: string = data.author_url || "";
    const authorHandle = authorUrl.split("/").pop() || "";

    if (!textContent) return null;

    return {
      author: authorHandle,
      authorName: authorMatch || "",
      content: textContent,
      mediaUrls: [],
      tweetDate: null, // oEmbed doesn't provide date
      thread: [],
    };
  } catch {
    return null;
  }
}

/**
 * Main scrape function: uses Playwright when cookies exist (full content),
 * falls back to oEmbed (lightweight but limited)
 */
export async function scrapeTweetSmart(url: string): Promise<TweetData> {
  // If cookies exist, prefer Playwright (gets thread, media, date, full text)
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      return await scrapeTweet(url);
    } catch (err) {
      console.error("Playwright scrape failed, trying oEmbed:", (err as Error).message);
    }
  }

  // Fallback to oEmbed (no auth needed, but no thread/media/date)
  const oembedResult = await scrapeViaOembed(url);
  if (oembedResult && oembedResult.content.length > 10) {
    return oembedResult;
  }

  // Last resort: try Playwright without cookies
  return scrapeTweet(url);
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
