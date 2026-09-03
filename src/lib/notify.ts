import { globalSlackWebhookUrl } from "./config";
import {
  getUserMeta,
  getWhatsAppCadenceSettings,
  getWhatsAppTo,
  isWhatsAppEnabled,
  listDeskUserIds,
  listMatchesSince,
  setUserMeta,
} from "./db";
import { DIGEST_CANDIDATE_LIMIT, isDigestDue } from "./desk-settings";
import { buildGenericWebhookPayload, buildSlackWebhookPayload, postJson } from "./webhooks";
import { buildWhatsAppDigest } from "./whatsapp-digest";
import type { NormalizedTweet, Rule } from "./types";

type WhatsAppSender = (text: string, options?: { mustBeLinked?: boolean; to?: string | null }) => Promise<void>;

let whatsappSender: WhatsAppSender | null = null;

export function registerWhatsAppSender(send: WhatsAppSender | null) {
  whatsappSender = send;
}

export async function notifyMatch(rule: Rule, tweet: NormalizedTweet): Promise<string[]> {
  const errors: string[] = [];
  const slackUrl = rule.slackWebhookUrl || globalSlackWebhookUrl();
  if (slackUrl) {
    try {
      await postJson(slackUrl, buildSlackWebhookPayload(rule, tweet));
    } catch (error) {
      errors.push(`slack: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (rule.genericWebhookUrl) {
    try {
      await postJson(rule.genericWebhookUrl, buildGenericWebhookPayload(rule, tweet));
    } catch (error) {
      errors.push(`webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export async function flushWhatsAppDigestForUser(
  userId: string,
  now = new Date(),
  force = false,
): Promise<boolean> {
  if (!whatsappSender || !userId) return false;
  if (!isWhatsAppEnabled(userId)) return false;
  const to = getWhatsAppTo(userId);
  if (!to) return false;
  const cadence = getWhatsAppCadenceSettings(userId);
  const lastAt = getUserMeta(userId, "whatsapp_digest_last_at");
  if (!force && !isDigestDue(lastAt, cadence.digestMinutes, now.getTime())) return false;
  const since = lastAt ?? new Date(now.getTime() - cadence.digestMinutes * 60_000).toISOString();
  const matches = listMatchesSince(userId, since, DIGEST_CANDIDATE_LIMIT);
  let sent = false;
  if (matches.length) {
    const text = buildWhatsAppDigest(
      matches.map((match) => ({
        rule: { name: match.ruleName },
        tweet: {
          id: match.tweetId,
          authorHandle: match.authorHandle,
          authorName: match.authorName,
          text: match.text,
          permalink: match.permalink,
        },
        score: match.signalScore,
        likes: match.likeCount,
        kol: match.kol,
      })),
      cadence.digestMinutes,
    );
    await whatsappSender(text, { to });
    sent = true;
  }
  setUserMeta(userId, "whatsapp_digest_last_at", now.toISOString());
  return sent;
}

export async function flushWhatsAppDigest(now = new Date()): Promise<boolean> {
  let sentAny = false;
  for (const userId of listDeskUserIds()) {
    if (await flushWhatsAppDigestForUser(userId, now)) sentAny = true;
  }
  return sentAny;
}
