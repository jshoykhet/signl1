import type { NormalizedTweet, Rule } from "./types";

export type GenericWebhookPayload = {
  event: "signal.match";
  rule: {
    id: string;
    name: string;
    query: string;
  };
  tweet: {
    id: string;
    author_handle: string;
    author_name: string;
    text: string;
    created_at: string;
    permalink: string;
  };
};

export type SlackWebhookPayload = {
  text: string;
  unfurl_links: boolean;
  blocks: Array<Record<string, unknown>>;
};

export function buildGenericWebhookPayload(
  rule: Pick<Rule, "id" | "name" | "query">,
  tweet: Pick<NormalizedTweet, "id" | "authorHandle" | "authorName" | "text" | "createdAt" | "permalink">,
): GenericWebhookPayload {
  return {
    event: "signal.match",
    rule: {
      id: rule.id,
      name: rule.name,
      query: rule.query,
    },
    tweet: {
      id: tweet.id,
      author_handle: tweet.authorHandle,
      author_name: tweet.authorName,
      text: tweet.text,
      created_at: tweet.createdAt,
      permalink: tweet.permalink,
    },
  };
}

export function buildSlackWebhookPayload(
  rule: Pick<Rule, "id" | "name" | "query">,
  tweet: Pick<NormalizedTweet, "id" | "authorHandle" | "authorName" | "text" | "createdAt" | "permalink">,
): SlackWebhookPayload {
  const preview = tweet.text.length > 280 ? `${tweet.text.slice(0, 277)}...` : tweet.text;
  return {
    text: `[${rule.name}] @${tweet.authorHandle}: ${preview}`,
    unfurl_links: false,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Signal · ${rule.name}`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*@${tweet.authorHandle}* ${tweet.authorName ? `(${tweet.authorName})` : ""}\n${preview}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `\`${rule.query}\`` },
          { type: "mrkdwn", text: tweet.createdAt },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open on X" },
            url: tweet.permalink,
          },
        ],
      },
    ],
  };
}

export async function postJson(url: string, body: unknown, timeoutMs = 8000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Webhook ${res.status} ${res.statusText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
