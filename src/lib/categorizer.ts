import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

export interface CategorizeResult {
  category: string;
  tags: string[];
}

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.XBRAIN_LLM_API_KEY) return null;
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.XBRAIN_LLM_API_KEY,
      baseURL: process.env.XBRAIN_LLM_BASE_URL || "https://api.openai.com/v1",
    });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a tweet categorizer. Given a tweet's text and author, respond with a JSON object containing:
- "category": one of: "ai", "tools", "open-source", "design", "engineering", "product", "career", "research", "news", "other"
- "tags": an array of 3-5 lowercase tags that describe the tweet's topics (no # prefix)

Respond ONLY with valid JSON, no explanation.`;

/**
 * Auto-categorize a tweet using any OpenAI-compatible LLM
 */
export async function categorizeTweet(
  content: string,
  author: string,
  userTags?: string[]
): Promise<CategorizeResult> {
  const client = getClient();

  // If no LLM configured, return user tags or defaults
  if (!client) {
    return {
      category: "other",
      tags: userTags ?? [],
    };
  }

  try {
    const model = process.env.XBRAIN_LLM_MODEL || "gpt-4o-mini";
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Author: @${author}\nTweet: ${content}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    let text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response");

    // Extract JSON from whatever the LLM returns (handles thinking models,
    // markdown fences, preamble text before the JSON, etc.)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const result: CategorizeResult = {
      category: parsed.category || "other",
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: string) => t.toLowerCase()) : [],
    };

    // Merge user-provided tags (they take priority)
    if (userTags && userTags.length > 0) {
      const tagSet = new Set([...userTags.map((t) => t.toLowerCase()), ...result.tags]);
      result.tags = [...tagSet];
    }

    return result;
  } catch (err) {
    // If LLM fails, use user tags or empty
    console.error("LLM categorization failed:", err);
    return {
      category: "other",
      tags: userTags ?? [],
    };
  }
}
