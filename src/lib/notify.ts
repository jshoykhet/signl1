import { globalSlackWebhookUrl } from "./config";
import { isWhatsAppEnabled } from "./db";
import { buildGenericWebhookPayload, buildSlackWebhookPayload, postJson } from "./webhooks";
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
  if (whatsappSender && isWhatsAppEnabled()) {
    try {
      await whatsappSender(buildWhatsAppText(rule, tweet));
    } catch (error) {
      errors.push(`whatsapp: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors;
}
