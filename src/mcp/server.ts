import dotenv from "dotenv";
dotenv.config({ quiet: true } as any);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addPost,
  searchPosts,
  listPosts,
  listTags,
  getPost,
  addConnection,
  getStats,
  getPostByUrl,
  type AddPostInput,
} from "../lib/db.js";
import { scrapeTweetSmart, normalizeUrl, closeBrowser } from "../lib/scraper.js";
import { categorizeTweet } from "../lib/categorizer.js";

const server = new McpServer({
  name: "xbrain",
  version: "0.1.0",
});

// ─── Tools ──────────────────────────────────────────────

server.tool(
  "xbrain_add",
  "Add a tweet to your niffler knowledge graph. Scrapes the tweet content and auto-categorizes it with AI.",
  {
    url: z.string().describe("The tweet/X post URL"),
    tags: z.array(z.string()).optional().describe("Tags to add (e.g. ['ai', 'tools'])"),
    notes: z.string().optional().describe("Personal notes about this post"),
  },
  async ({ url, tags, notes }) => {
    try {
      const normalized = normalizeUrl(url);
      const existing = getPostByUrl(normalized);
      if (existing) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Already saved: "${existing.content.substring(0, 80)}..." by @${existing.author}\nTags: ${existing.tags.map((t) => `#${t}`).join(" ")}\nID: ${existing.id}`,
            },
          ],
        };
      }

      const tweet = await scrapeTweetSmart(url);
      const { category, tags: aiTags } = await categorizeTweet(
        tweet.content,
        tweet.author,
        tags
      );

      const input: AddPostInput = {
        url: normalized,
        author: tweet.author,
        author_name: tweet.authorName,
        content: tweet.content,
        media_urls: tweet.mediaUrls.length > 0 ? tweet.mediaUrls : undefined,
        thread: tweet.thread.length > 0 ? tweet.thread : undefined,
        tweet_date: tweet.tweetDate ?? undefined,
        category,
        notes,
        tags: aiTags,
      };

      const post = addPost(input);
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved! "${post.content.substring(0, 80)}..."\nAuthor: @${post.author}${post.author_name ? ` (${post.author_name})` : ""}\nCategory: ${post.category}\nTags: ${post.tags.map((t) => `#${t}`).join(" ")}\nID: ${post.id}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "xbrain_search",
  "Full-text search across your saved tweets in niffler.",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results (default 20)"),
  },
  async ({ query, limit }) => {
    const results = searchPosts(query, limit ?? 20);
    if (results.length === 0) {
      return { content: [{ type: "text" as const, text: "No results found." }] };
    }

    const text = results
      .map(
        (p, i) =>
          `${i + 1}. @${p.author}: "${p.content.substring(0, 120)}..."\n   Tags: ${p.tags.map((t) => `#${t}`).join(" ")} | ${p.url}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${results.length} result(s):\n\n${text}`,
        },
      ],
    };
  }
);

server.tool(
  "xbrain_list_by_tag",
  "List all posts with a specific tag.",
  {
    tag: z.string().describe("Tag name (without #)"),
    limit: z.number().optional().describe("Max results (default 20)"),
  },
  async ({ tag, limit }) => {
    const posts = listPosts({ tag, limit: limit ?? 20 });
    if (posts.length === 0) {
      return { content: [{ type: "text" as const, text: `No posts tagged #${tag}` }] };
    }

    const text = posts
      .map(
        (p) =>
          `- @${p.author}: "${p.content.substring(0, 100)}..." [${p.tags.map((t) => `#${t}`).join(", ")}]`
      )
      .join("\n");

    return {
      content: [
        { type: "text" as const, text: `Posts tagged #${tag} (${posts.length}):\n\n${text}` },
      ],
    };
  }
);

server.tool("xbrain_get_tags", "List all tags in your niffler with post counts.", {}, async () => {
  const tags = listTags();
  if (tags.length === 0) {
    return { content: [{ type: "text" as const, text: "No tags yet." }] };
  }

  const text = tags.map((t) => `#${t.name} (${t.count})`).join(" | ");
  return { content: [{ type: "text" as const, text: `Tags: ${text}` }] };
});

server.tool(
  "xbrain_get_post",
  "Get full details of a specific saved post.",
  {
    id: z.string().describe("Post ID"),
  },
  async ({ id }) => {
    const post = getPost(id);
    if (!post) {
      return {
        content: [{ type: "text" as const, text: "Post not found." }],
        isError: true,
      };
    }

    const text = [
      `Author: @${post.author}${post.author_name ? ` (${post.author_name})` : ""}`,
      `Content: ${post.content}`,
      `Tags: ${post.tags.map((t) => `#${t}`).join(" ")}`,
      `Category: ${post.category || "none"}`,
      `URL: ${post.url}`,
      post.tweet_date ? `Date: ${post.tweet_date}` : null,
      post.notes ? `Notes: ${post.notes}` : null,
      post.thread && post.thread.length > 0
        ? `Thread (${post.thread.length} more):\n${post.thread.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return { content: [{ type: "text" as const, text }] };
  }
);

server.tool(
  "xbrain_connect",
  "Create a connection between two posts in your niffler.",
  {
    sourceId: z.string().describe("Source post ID"),
    targetId: z.string().describe("Target post ID"),
    label: z.string().optional().describe("Relationship label"),
  },
  async ({ sourceId, targetId, label }) => {
    try {
      const id = addConnection(sourceId, targetId, label);
      return {
        content: [
          {
            type: "text" as const,
            text: `Connected! ${sourceId} → ${targetId}${label ? ` (${label})` : ""}`,
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool("xbrain_stats", "Get overview stats for your niffler.", {}, async () => {
  const stats = getStats();
  return {
    content: [
      {
        type: "text" as const,
        text: `niffler: ${stats.posts} posts | ${stats.tags} tags | ${stats.connections} connections | Last added: ${stats.lastAdded ?? "never"}`,
      },
    ],
  };
});

server.tool(
  "xbrain_ask",
  "Ask a question about your saved posts. Uses AI to answer based on your niffler content.",
  {
    question: z.string().describe("Your question"),
  },
  async ({ question }) => {
    // Search for relevant posts
    const results = searchPosts(question, 10);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No relevant posts found in your brain to answer this question.",
          },
        ],
      };
    }

    // Format context from matching posts
    const context = results
      .map(
        (p) =>
          `[@${p.author}] ${p.content}${p.thread ? "\nThread: " + p.thread.join(" | ") : ""}`
      )
      .join("\n---\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Based on ${results.length} relevant saved posts:\n\n${context}\n\n---\nQuestion: ${question}\n(Use the above context from saved posts to answer the user's question.)`,
        },
      ],
    };
  }
);

// ─── Start ──────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
