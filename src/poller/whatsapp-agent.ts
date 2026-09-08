import { isDemoMode, xBearerToken } from "../lib/config";
import {
  getWhatsAppTo,
  isWhatsAppAgentEnabled,
  listDeskUserIds,
  listMatches,
  setUserMeta,
} from "../lib/db";
import { DEMO_FIXTURES, VENTURE_DEMO_FIXTURES, fixtureToTweet } from "../lib/demo-fixtures";
import { matchesQuery } from "../lib/query";
import {
  AGENT_COOLDOWN_MS,
  AGENT_LOOKBACK_HOURS,
  AGENT_RESULT_LIMIT,
  agentHelpText,
  formatAgentResults,
  parseAgentMessage,
  senderIsAllowed,
} from "../lib/whatsapp-agent";
import { isSameWhatsAppUser } from "../lib/whatsapp";
import { recentSearch, XRateLimiter } from "../lib/x-client";
import { sendWhatsAppText } from "./whatsapp-session";

type InboundMessage = {
  key?: {
    id?: string | null;
    remoteJid?: string | null;
    participant?: string | null;
    fromMe?: boolean | null;
  };
  message?: {
    conversation?: string | null;
    extendedTextMessage?: { text?: string | null } | null;
    ephemeralMessage?: { message?: InboundMessage["message"] } | null;
  } | null;
};

const seenIds = new Set<string>();
const lastSearchAt = new Map<string, number>();
const limiter = new XRateLimiter();
let searchTail: Promise<void> = Promise.resolve();

function remember(id: string) {
  seenIds.add(id);
  if (seenIds.size > 80) {
    const first = seenIds.values().next().value;
    if (first) seenIds.delete(first);
  }
}

function extractText(message: InboundMessage["message"]): string {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.ephemeralMessage?.message) return extractText(message.ephemeralMessage.message);
  return "";
}

function authorizedIds(linkedIds: string[]): string[] {
  const out = [...linkedIds];
  for (const userId of listDeskUserIds()) {
    const to = getWhatsAppTo(userId);
    if (to) out.push(to);
  }
  return out;
}

function deskUserForSender(sender: string, remoteJid: string): string | null {
  const users = listDeskUserIds();
  for (const userId of users) {
    if (!isWhatsAppAgentEnabled(userId)) continue;
    const to = getWhatsAppTo(userId);
    if (!to) continue;
    if (isSameWhatsAppUser(sender, to)) return userId;
    if (to.includes("@g.us") && isSameWhatsAppUser(remoteJid, to)) return userId;
  }
  return users.find((userId) => isWhatsAppAgentEnabled(userId)) ?? null;
}

function lookbackStart(): string {
  return new Date(Date.now() - AGENT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

function searchFixtures(query: string) {
  const now = new Date().toISOString();
  return [...DEMO_FIXTURES, ...VENTURE_DEMO_FIXTURES]
    .map((fixture) => fixtureToTweet(fixture, fixture.id, now))
    .filter((tweet) => matchesQuery(tweet, query))
    .slice(0, AGENT_RESULT_LIMIT);
}

async function reply(to: string, text: string) {
  await sendWhatsAppText(text, { to, mustBeLinked: true });
}

async function runSearch(userId: string, to: string, raw: string, query: string) {
  const key = `${userId}:${to}`;
  const last = lastSearchAt.get(key) ?? 0;
  const wait = AGENT_COOLDOWN_MS - (Date.now() - last);
  if (wait > 0) {
    await reply(to, `Wait ${Math.ceil(wait / 1000)}s, then search again.`);
    return;
  }
  lastSearchAt.set(key, Date.now());
  setUserMeta(userId, "whatsapp_agent_last_at", new Date().toISOString());
  setUserMeta(userId, "whatsapp_agent_last_query", raw.slice(0, 180));

  const token = xBearerToken();
  if (!token || isDemoMode()) {
    const tweets = searchFixtures(query);
    await reply(to, formatAgentResults({ label: raw, tweets, demo: true }));
    return;
  }

  const result = await recentSearch({
    bearerToken: token,
    query,
    startTime: lookbackStart(),
    maxResults: 10,
    limiter,
  });
  const tweets = result.tweets
    .filter((tweet) => !tweet.isRetweet)
    .slice(0, AGENT_RESULT_LIMIT);
  await reply(to, formatAgentResults({ label: raw, tweets }));
}

export async function handleWhatsAppAgentUpsert(
  upsert: { messages?: InboundMessage[]; type?: string },
  linkedIds: string[],
): Promise<void> {
  const allowed = authorizedIds(linkedIds);
  for (const msg of upsert.messages ?? []) {
    const id = msg.key?.id;
    const remoteJid = msg.key?.remoteJid ?? "";
    if (!id || !remoteJid || seenIds.has(id)) continue;
    if (remoteJid === "status@broadcast") continue;
    remember(id);

    const sender = msg.key?.participant || remoteJid;
    const selfChat = linkedIds.some((id) => isSameWhatsAppUser(remoteJid, id));
    if (msg.key?.fromMe && !selfChat) continue;
    if (!senderIsAllowed(sender, allowed) && !(selfChat && senderIsAllowed(sender, linkedIds))) {
      continue;
    }

    const text = extractText(msg.message).trim();
    if (!text) continue;
    const intent = parseAgentMessage(text);
    if (!intent) continue;

    const userId = deskUserForSender(sender, remoteJid);
    if (!userId) {
      await reply(remoteJid, "WhatsApp agent is off. Turn it on in Settings.");
      continue;
    }

    const replyTo = remoteJid.endsWith("@g.us") ? remoteJid : sender;
    if (intent.kind === "help") {
      await reply(replyTo, agentHelpText());
      continue;
    }
    if (intent.kind === "status") {
      const mode = isDemoMode() || !xBearerToken() ? "sample posts" : "live X";
      await reply(
        replyTo,
        `*Signl1 agent*\nLinked. Mode: ${mode}. Text a ticker, @handle, or search.`,
      );
      continue;
    }
    if (intent.kind === "inbox") {
      const matches = listMatches(userId, { limit: AGENT_RESULT_LIMIT });
      await reply(
        replyTo,
        formatAgentResults({
          label: "inbox",
          tweets: matches.map((match) => ({
            authorHandle: match.authorHandle,
            authorName: match.authorName,
            text: match.text,
            permalink: match.permalink,
            likeCount: match.likeCount ?? 0,
          })),
          emptyHint: "Inbox is empty. Search X, or wait for the next poll.",
        }),
      );
      continue;
    }

    const run = searchTail.then(() => runSearch(userId, replyTo, intent.raw, intent.query));
    searchTail = run.then(
      () => undefined,
      () => undefined,
    );
    try {
      await run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[whatsapp-agent] ${message}`);
      await reply(replyTo, `Search failed. ${message.slice(0, 180)}`);
    }
  }
}
