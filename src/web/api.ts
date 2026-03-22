import { Router, type Request, type Response } from "express";
import {
  addPost, getPost, listPosts, searchPosts, deletePost, updatePost,
  listTags, addConnection, removeConnection, getGraphData, getStats,
  getPostByUrl, type AddPostInput,
} from "../lib/db.js";
import { scrapeTweetSmart, normalizeUrl, closeBrowser } from "../lib/scraper.js";
import { categorizeTweet } from "../lib/categorizer.js";

export const api = Router();

// ─── Posts ──────────────────────────────────────────────

api.post("/api/posts", async (req: Request, res: Response) => {
  try {
    const { url, tags, notes } = req.body as { url: string; tags?: string[]; notes?: string };
    if (!url) { res.status(400).json({ error: "URL is required" }); return; }

    const normalized = normalizeUrl(url);
    const existing = getPostByUrl(normalized);
    if (existing) { res.json({ post: existing, duplicate: true }); return; }

    const tweet = await scrapeTweetSmart(url);
    const { category, tags: aiTags } = await categorizeTweet(tweet.content, tweet.author, tags);

    const input: AddPostInput = {
      url: normalized, author: tweet.author, author_name: tweet.authorName,
      content: tweet.content,
      media_urls: tweet.mediaUrls.length > 0 ? tweet.mediaUrls : undefined,
      thread: tweet.thread.length > 0 ? tweet.thread : undefined,
      tweet_date: tweet.tweetDate ?? undefined,
      category, notes, tags: aiTags,
    };

    const post = addPost(input);
    res.json({ post, duplicate: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.get("/api/posts", (req: Request, res: Response) => {
  const { tag, q, limit, offset } = req.query as Record<string, string>;
  if (q) {
    const results = searchPosts(q, Number(limit) || 20);
    res.json({ posts: results, total: results.length });
    return;
  }
  const posts = listPosts({ tag: tag || undefined, limit: Number(limit) || 50, offset: Number(offset) || 0 });
  res.json({ posts, total: posts.length });
});

api.get("/api/posts/:id", (req: Request, res: Response) => {
  const post = getPost(req.params.id as string);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ post });
});

api.delete("/api/posts/:id", (req: Request, res: Response) => {
  res.json({ deleted: deletePost(req.params.id as string) });
});

api.patch("/api/posts/:id", (req: Request, res: Response) => {
  const { notes, category, tags } = req.body;
  const post = updatePost(req.params.id as string, { notes, category, tags });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ post });
});

// ─── Tags ───────────────────────────────────────────────

api.get("/api/tags", (_req: Request, res: Response) => {
  res.json({ tags: listTags() });
});

// ─── Graph ──────────────────────────────────────────────

api.get("/api/graph", (req: Request, res: Response) => {
  const { tag } = req.query as Record<string, string>;
  res.json(getGraphData(tag || undefined));
});

// ─── Connections ────────────────────────────────────────

api.post("/api/connections", (req: Request, res: Response) => {
  const { sourceId, targetId, label } = req.body;
  if (!sourceId || !targetId) { res.status(400).json({ error: "sourceId and targetId are required" }); return; }
  res.json({ id: addConnection(sourceId, targetId, label) });
});

api.delete("/api/connections/:id", (req: Request, res: Response) => {
  res.json({ deleted: removeConnection(req.params.id as string) });
});

// ─── Stats ──────────────────────────────────────────────

api.get("/api/stats", (_req: Request, res: Response) => {
  res.json(getStats());
});

// ─── Search ─────────────────────────────────────────────

api.get("/api/search", (req: Request, res: Response) => {
  const { q, limit } = req.query as Record<string, string>;
  if (!q) { res.status(400).json({ error: "Query parameter 'q' is required" }); return; }
  res.json({ posts: searchPosts(q, Number(limit) || 20) });
});
