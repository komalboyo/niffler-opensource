import dotenv from "dotenv";
dotenv.config({ quiet: true } as any);

import {
  addPost,
  searchPosts,
  listPosts,
  listTags,
  getStats,
  getPostByUrl,
  type AddPostInput,
} from "./lib/db.js";
import { scrapeTweetSmart, normalizeUrl, closeBrowser } from "./lib/scraper.js";
import { categorizeTweet } from "./lib/categorizer.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "add":
      await handleAdd();
      break;
    case "search":
      handleSearch();
      break;
    case "list":
      handleList();
      break;
    case "tags":
      handleTags();
      break;
    case "stats":
      handleStats();
      break;
    default:
      printUsage();
  }
}

async function handleAdd() {
  const url = args[1];
  if (!url) {
    console.error("Usage: xbrain add <url> [--tags tag1,tag2] [--notes 'your notes']");
    process.exit(1);
  }

  // Parse flags
  const userTags: string[] = [];
  let notes: string | undefined;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--tags" && args[i + 1]) {
      userTags.push(...args[i + 1].split(",").map((t) => t.replace(/^#/, "").trim()));
      i++;
    } else if (args[i] === "--notes" && args[i + 1]) {
      notes = args[i + 1];
      i++;
    } else if (args[i].startsWith("#")) {
      userTags.push(args[i].replace(/^#/, ""));
    }
  }

  const normalized = normalizeUrl(url);

  // Check if already saved
  const existing = getPostByUrl(normalized);
  if (existing) {
    console.log(`Already saved: "${existing.content.substring(0, 60)}..." by @${existing.author}`);
    console.log(`Tags: ${existing.tags.map((t) => `#${t}`).join(" ")}`);
    process.exit(0);
  }

  console.log("Scraping tweet...");
  const tweet = await scrapeTweetSmart(url);

  console.log("Categorizing...");
  const { category, tags } = await categorizeTweet(tweet.content, tweet.author, userTags);

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
    tags,
  };

  const post = addPost(input);

  console.log(`\nSaved! "${post.content.substring(0, 80)}..."`);
  console.log(`Author: @${post.author}${post.author_name ? ` (${post.author_name})` : ""}`);
  console.log(`Category: ${post.category}`);
  console.log(`Tags: ${post.tags.map((t) => `#${t}`).join(" ")}`);
  console.log(`ID: ${post.id}`);

  await closeBrowser();
}

function handleSearch() {
  const query = args.slice(1).join(" ");
  if (!query) {
    console.error("Usage: xbrain search <query>");
    process.exit(1);
  }

  const results = searchPosts(query);
  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  console.log(`Found ${results.length} result(s):\n`);
  for (const post of results) {
    console.log(`  @${post.author}: "${post.content.substring(0, 100)}..."`);
    console.log(`  Tags: ${post.tags.map((t) => `#${t}`).join(" ")} | ${post.url}`);
    console.log();
  }
}

function handleList() {
  const tagFlag = args.indexOf("--tag");
  const tag = tagFlag !== -1 ? args[tagFlag + 1] : undefined;
  const posts = listPosts({ tag, limit: 20 });

  if (posts.length === 0) {
    console.log("No posts saved yet.");
    return;
  }

  console.log(`${posts.length} post(s)${tag ? ` tagged #${tag}` : ""}:\n`);
  for (const post of posts) {
    console.log(`  @${post.author}: "${post.content.substring(0, 80)}..."`);
    console.log(`  Tags: ${post.tags.map((t) => `#${t}`).join(" ")}`);
    console.log();
  }
}

function handleTags() {
  const tags = listTags();
  if (tags.length === 0) {
    console.log("No tags yet.");
    return;
  }

  console.log("Tags:");
  for (const tag of tags) {
    console.log(`  #${tag.name} (${tag.count})`);
  }
}

function handleStats() {
  const stats = getStats();
  console.log(`niffler stats:`);
  console.log(`  Posts: ${stats.posts}`);
  console.log(`  Tags: ${stats.tags}`);
  console.log(`  Connections: ${stats.connections}`);
  console.log(`  Last added: ${stats.lastAdded ?? "never"}`);
}

function printUsage() {
  console.log(`
niffler — Personal AI knowledge graph for X/Twitter

Usage:
  xbrain add <url> [#tag1 #tag2] [--tags tag1,tag2] [--notes "..."]
  xbrain search <query>
  xbrain list [--tag tagname]
  xbrain tags
  xbrain stats
`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
