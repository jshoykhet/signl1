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
import { buildWhatsAppText } from "./whatsapp";
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
  const userId = rule.userId || "";
  const to = getWhatsAppTo(userId);
  const cadence = getWhatsAppCadenceSettings(userId);
  if (whatsappSender && to && isWhatsAppEnabled(userId) && cadence.alertMode === "immediate") {
    const text = buildWhatsAppText(rule, tweet);
    void whatsappSender(text, { to }).catch((error) => {
      console.warn(
        `[poller] notify failed for ${rule.name}: whatsapp: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
  return errors;
}

export async function flushWhatsAppDigest(now = new Date()): Promise<boolean> {
  if (!whatsappSender) return false;
  let sentAny = false;
  for (const userId of listDeskUserIds()) {
    if (!isWhatsAppEnabled(userId)) continue;
    const to = getWhatsAppTo(userId);
    if (!to) continue;
    const cadence = getWhatsAppCadenceSettings(userId);
    if (cadence.alertMode !== "digest") continue;
    const lastAt = getUserMeta(userId, "whatsapp_digest_last_at");
    if (!isDigestDue(lastAt, cadence.digestMinutes, now.getTime())) continue;
    const matches = lastAt ? listMatchesSince(userId, lastAt, DIGEST_CANDIDATE_LIMIT) : [];
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
      sentAny = true;
    }
    setUserMeta(userId, "whatsapp_digest_last_at", now.toISOString());
  }
  return sentAny;
}
