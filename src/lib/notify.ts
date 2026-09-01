import { globalSlackWebhookUrl } from "./config";
import {
  getMeta,
  getWhatsAppCadenceSettings,
  isWhatsAppEnabled,
  listMatchesSince,
  setMeta,
} from "./db";
import { isDigestDue } from "./desk-settings";
import { buildGenericWebhookPayload, buildSlackWebhookPayload, postJson } from "./webhooks";
import { buildWhatsAppDigest } from "./whatsapp-digest";
import { buildWhatsAppText } from "./whatsapp";
import type { NormalizedTweet, Rule } from "./types";

type WhatsAppSender = (text: string) => Promise<void>;

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
  const cadence = getWhatsAppCadenceSettings();
  if (whatsappSender && isWhatsAppEnabled() && cadence.alertMode === "immediate") {
    try {
      await whatsappSender(buildWhatsAppText(rule, tweet));
    } catch (error) {
      errors.push(`whatsapp: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}

export async function flushWhatsAppDigest(now = new Date()): Promise<boolean> {
  if (!whatsappSender || !isWhatsAppEnabled()) return false;
  const cadence = getWhatsAppCadenceSettings();
  if (cadence.alertMode !== "digest") return false;
  const lastAt = getMeta("whatsapp_digest_last_at");
  if (!isDigestDue(lastAt, cadence.digestMinutes, now.getTime())) return false;
  const matches = lastAt ? listMatchesSince(lastAt) : [];
  if (matches.length) {
    const text = buildWhatsAppDigest(
      matches.map((match) => ({
        rule: { name: match.ruleName },
        tweet: {
          authorHandle: match.authorHandle,
          authorName: match.authorName,
          text: match.text,
          permalink: match.permalink,
        },
      })),
      cadence.digestMinutes,
    );
    await whatsappSender(text);
  }
  setMeta("whatsapp_digest_last_at", now.toISOString());
  return matches.length > 0;
}
