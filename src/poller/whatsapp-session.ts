import fs from "node:fs";
import type { ConnectionState, WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { getMeta, getWhatsAppTo, listDeskUserIds, setMeta, takeMetaValue } from "../lib/db";
import {
  hasCompletedPairHandshake,
  isTransientWhatsAppDisconnect,
  shouldDropSyntheticMe,
  userFacingWhatsAppError,
  WA_LOGGED_OUT,
  WA_RESTART_REQUIRED,
} from "../lib/whatsapp-disconnect";
import { formatPairingCode, isSameWhatsAppUser, isWhatsAppSocketReady, toOwnChatJid, toWhatsAppJid, whatsappAuthDir } from "../lib/whatsapp";
import {
  agentHelpText,
  shouldSendAgentWelcome,
  WHATSAPP_PENDING_WELCOME_META,
  WHATSAPP_WELCOME_SENT_META,
} from "../lib/whatsapp-agent";

const log = pino({ level: process.env.WHATSAPP_DEBUG === "1" ? "debug" : "warn" });

let sock: WASocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let socketGen = 0;
let lastQr: string | null = null;
/** Phone we already minted a pairing code for on this socket. QR refresh must not mint another. */
let pairingIssuedForPhone: string | null = null;
let pairingInFlight = false;
let logoutStrikes = 0;

function isoNow(): string {
  return new Date().toISOString();
}

function pairPhoneDigits(): string {
  return (getMeta("whatsapp_pair_phone") ?? "").replace(/\D/g, "");
}

function sessionLinked(target: WASocket | null = sock): boolean {
  return isWhatsAppSocketReady(target);
}

function writeStatus(
  status: string,
  extra: { qr?: string; pairingCode?: string; linkedAs?: string; error?: string } = {},
) {
  setMeta("whatsapp_status", status);
  if ("qr" in extra) setMeta("whatsapp_qr", extra.qr ?? "");
  if ("pairingCode" in extra) setMeta("whatsapp_pairing_code", extra.pairingCode ?? "");
  if ("linkedAs" in extra) setMeta("whatsapp_linked_as", extra.linkedAs ?? "");
  if ("error" in extra) setMeta("whatsapp_error", extra.error ?? "");
}

function wipeAuthDir() {
  fs.rmSync(whatsappAuthDir(), { recursive: true, force: true });
  setMeta(WHATSAPP_PENDING_WELCOME_META, "");
  setMeta(WHATSAPP_WELCOME_SENT_META, "");
}

function endSocket(target: WASocket | null) {
  if (!target) return;
  try {
    target.end(undefined);
  } catch {
    /* already closed */
  }
}

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectWhatsApp();
  }, delayMs);
}

function reconnectNow() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  void connectWhatsApp();
}

async function issuePairingCode(target: WASocket): Promise<void> {
  const phone = pairPhoneDigits();
  if (!phone || hasCompletedPairHandshake(target.authState.creds) || pairingInFlight) return;
  if (pairingIssuedForPhone === phone && getMeta("whatsapp_pairing_code")) return;
  pairingInFlight = true;
  pairingIssuedForPhone = phone;
  try {
    const code = await target.requestPairingCode(phone);
    writeStatus("pairing", { pairingCode: code, error: "" });
    console.log(`[whatsapp] pairing code ${formatPairingCode(code) ?? code}`);
  } catch (error) {
    pairingIssuedForPhone = null;
    const message = error instanceof Error ? error.message : String(error);
    writeStatus("error", { error: message });
    console.error(`[whatsapp] pairing failed: ${message}`);
  } finally {
    pairingInFlight = false;
  }
}

function handleConnectionUpdate(
  gen: number,
  next: WASocket,
  update: Partial<ConnectionState>,
  saveCreds: () => Promise<void>,
) {
  if (gen !== socketGen) return;
  const { connection, lastDisconnect, qr, isNewLogin } = update;

  if (isNewLogin) {
    console.log("[whatsapp] pairing confirmed; WhatsApp will restart the socket");
    setMeta(WHATSAPP_PENDING_WELCOME_META, "1");
    writeStatus("connecting", { qr: "", error: "" });
  }

  if (qr) {
    lastQr = qr;
    if (hasCompletedPairHandshake(next.authState.creds)) {
      writeStatus("connecting", { qr: "", error: "" });
    } else if (pairPhoneDigits() && !next.authState.creds.registered) {
      void issuePairingCode(next);
      writeStatus("pairing", { qr, error: "" });
    } else if (!next.authState.creds.registered) {
      writeStatus("qr", { qr, error: "" });
    }
  }

  if (connection === "open") {
    const hadPairingCode = Boolean(getMeta("whatsapp_pairing_code"));
    if (hadPairingCode) setMeta(WHATSAPP_PENDING_WELCOME_META, "1");
    connecting = false;
    pairingIssuedForPhone = null;
    lastQr = null;
    next.authState.creds.registered = true;
    logoutStrikes = 0;
    void saveCreds();
    const linkedAs = next.user?.id ?? next.authState.creds.me?.id ?? "";
    writeStatus("connected", { qr: "", pairingCode: "", linkedAs, error: "" });
    setMeta("whatsapp_pair_phone", "");
    console.log(`[whatsapp] linked as ${linkedAs || "unknown"}`);
    if (shouldSendAgentWelcome(getMeta(WHATSAPP_PENDING_WELCOME_META))) {
      sendAgentWelcomeSoon();
    }
  }

  if (connection === "close") {
    connecting = false;
    if (sock === next) sock = null;
    lastQr = null;
    const statusCode =
      lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : undefined;
    const rawMessage =
      lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "disconnected";

    if (statusCode === WA_LOGGED_OUT) {
      const paired = hasCompletedPairHandshake(next.authState.creds);
      logoutStrikes += 1;
      if (paired && logoutStrikes < 2) {
        console.warn(
          `[whatsapp] logged-out signal on a paired session (try ${logoutStrikes}); retrying before wiping auth`,
        );
        writeStatus("connecting", { error: "" });
        scheduleReconnect(2_000);
        return;
      }
      logoutStrikes = 0;
      pairingIssuedForPhone = null;
      wipeAuthDir();
      writeStatus("idle", {
        qr: "",
        pairingCode: "",
        linkedAs: "",
        error: "WhatsApp session logged out. Scan the QR or request a pairing code again.",
      });
      scheduleReconnect(2_000);
      return;
    }

    logoutStrikes = 0;
    console.log(`[whatsapp] connection closed (${statusCode ?? "unknown"}): ${rawMessage}`);

    const paired = hasCompletedPairHandshake(next.authState.creds);
    const keepPairingUi = Boolean(getMeta("whatsapp_pairing_code")) && !paired;
    const nextStatus = paired ? "connecting" : keepPairingUi ? "pairing" : "connecting";
    const visibleError = isTransientWhatsAppDisconnect(statusCode)
      ? ""
      : (userFacingWhatsAppError(rawMessage) ?? "");

    if (statusCode === WA_RESTART_REQUIRED) {
      console.log("[whatsapp] stream restart required — reconnecting with saved session");
      writeStatus(nextStatus, { error: visibleError });
      reconnectNow();
      return;
    }

    writeStatus(nextStatus, { error: visibleError });
    scheduleReconnect(paired ? 1_000 : 4_000);
  }
}

async function connectWhatsApp() {
  if (connecting) return;
  connecting = true;
  const gen = ++socketGen;
  lastQr = null;
  pairingIssuedForPhone = null;
  if (sock) {
    const previous = sock;
    sock = null;
    endSocket(previous);
  }
  try {
    const {
      default: makeWASocket,
      Browsers,
      fetchLatestBaileysVersion,
      useMultiFileAuthState,
    } = await import("@whiskeysockets/baileys");
    fs.mkdirSync(whatsappAuthDir(), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(whatsappAuthDir());
    if (shouldDropSyntheticMe(state.creds)) {
      // requestPairingCode writes a synthetic `me` before the phone confirms.
      // Leaving it in creds makes the next handshake a login instead of a
      // companion registration. After pair-success, `account` is set and we
      // must keep `me` so the 515 restart can log in.
      delete state.creds.me;
      await saveCreds();
    }
    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (error) {
      console.warn(
        `[whatsapp] could not fetch WA version, using library default: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const alreadyPaired = hasCompletedPairHandshake(state.creds);
    writeStatus(alreadyPaired ? "connecting" : getMeta("whatsapp_pairing_code") ? "pairing" : "connecting", {
      qr: "",
      error: "",
    });

    const next = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: log,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: true,
      syncFullHistory: false,
    });
    sock = next;

    next.ev.process(async (events) => {
      if (events["creds.update"]) {
        await saveCreds();
      }
      if (events["connection.update"]) {
        handleConnectionUpdate(gen, next, events["connection.update"], saveCreds);
      }
      if (events["messages.upsert"]) {
        try {
          const { handleWhatsAppAgentUpsert } = await import("./whatsapp-agent");
          await handleWhatsAppAgentUpsert(events["messages.upsert"], linkedIdentities());
        } catch (error) {
          console.error(
            `[whatsapp-agent] ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
  } catch (error) {
    connecting = false;
    sock = null;
    const message = error instanceof Error ? error.message : String(error);
    writeStatus("error", { error: message });
    console.error(`[whatsapp] ${message}`);
    scheduleReconnect(8_000);
  }
}

function linkedIdentities(): string[] {
  const ids = [sock?.user?.id, sock?.authState.creds.me?.id, sock?.authState.creds.me?.lid];
  return ids.filter((id): id is string => Boolean(id));
}

function isSelfDestination(raw: string): boolean {
  return linkedIdentities().some((id) => isSameWhatsAppUser(raw, id));
}

async function resolveDestinationJid(raw: string): Promise<string> {
  if (!sock) throw new Error("WhatsApp is not linked");
  if (isSelfDestination(raw)) {
    const me = sock.user?.id ?? sock.authState.creds.me?.id;
    if (!me) throw new Error("WhatsApp session identity is missing");
    // Companion → same account must use the PN JID. onWhatsApp often returns
    // an @lid address; Android then treats the send as fromMe and never shows it.
    return toOwnChatJid(me);
  }
  const jid = raw.includes("@") ? raw : toWhatsAppJid(raw);
  if (jid.endsWith("@g.us") || jid.endsWith("@newsletter")) {
    return jid;
  }
  try {
    const query = jid.endsWith("@lid") ? jid : (jid.replace(/@.+$/, "").split(":")[0] ?? jid);
    const results = await sock.onWhatsApp(query);
    const hit = results?.[0];
    if (hit?.exists && hit.jid && !isSelfDestination(hit.jid)) return hit.jid;
  } catch {
    /* send to constructed PN JID */
  }
  return jid;
}

function destinationForSend(override?: string | null): string | null {
  if (override?.trim()) return override.trim();
  const self = sock?.user?.id ?? sock?.authState.creds.me?.id;
  if (!self) return null;
  return toOwnChatJid(self);
}

let sendTail: Promise<void> = Promise.resolve();
let welcomeTimer: ReturnType<typeof setTimeout> | null = null;

function sendAgentWelcomeSoon() {
  if (welcomeTimer) return;
  welcomeTimer = setTimeout(() => {
    welcomeTimer = null;
    void sendAgentWelcome();
  }, 1_200);
}

async function sendAgentWelcome() {
  if (!shouldSendAgentWelcome(getMeta(WHATSAPP_PENDING_WELCOME_META))) return;
  if (!sessionLinked()) return;
  try {
    const to = listDeskUserIds().map((id) => getWhatsAppTo(id)).find((value) => Boolean(value)) ?? null;
    await sendWhatsAppText(agentHelpText(), { mustBeLinked: true, to });
    setMeta(WHATSAPP_WELCOME_SENT_META, sock?.user?.id ?? "1");
    setMeta(WHATSAPP_PENDING_WELCOME_META, "");
    console.log("[whatsapp] sent agent help after first link");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[whatsapp] first-link help failed: ${message}`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function sendWhatsAppTextNow(
  text: string,
  options: { mustBeLinked?: boolean; to?: string | null } = {},
): Promise<void> {
  if (!sessionLinked()) {
    if (options.mustBeLinked) {
      throw new Error("WhatsApp is still connecting. Wait until status is Linked, then send the test.");
    }
    reconnectNow();
    throw new Error("WhatsApp socket is not ready");
  }
  const to = destinationForSend(options.to);
  if (!to) {
    if (options.mustBeLinked) throw new Error("Set a WhatsApp destination number on Settings");
    return;
  }
  try {
    const sent = await withTimeout(
      (async () => {
        const jid = await resolveDestinationJid(to);
        const result = await sock!.sendMessage(jid, { text });
        return { jid, result };
      })(),
      12_000,
      "WhatsApp send timed out after 12s",
    );
    console.log(`[whatsapp] sent to ${sent.jid}${sent.result?.key?.id ? ` id=${sent.result.key.id}` : ""}`);
    setMeta("whatsapp_last_sent_at", isoNow());
    setMeta("whatsapp_last_sent_to", sent.jid);
    setMeta("whatsapp_error", "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setMeta("whatsapp_error", message);
    if (/timed out|not ready|closed|Connection/i.test(message)) {
      writeStatus("connecting", { error: message });
      reconnectNow();
    }
    throw error;
  }
}

export async function sendWhatsAppText(
  text: string,
  options: { mustBeLinked?: boolean; to?: string | null } = {},
): Promise<void> {
  const run = sendTail.then(() => sendWhatsAppTextNow(text, options));
  sendTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function pumpCommands() {
  const logout = takeMetaValue("whatsapp_logout");
  if (logout) {
    pairingIssuedForPhone = null;
    lastQr = null;
    try {
      if (sock) await sock.logout();
    } catch {
      /* already gone */
    }
    sock = null;
    wipeAuthDir();
    writeStatus("idle", { qr: "", pairingCode: "", linkedAs: "", error: "" });
    scheduleReconnect(1_000);
  }

  const refresh = takeMetaValue("whatsapp_pair_refresh");
  if (refresh) {
    pairingIssuedForPhone = null;
    setMeta("whatsapp_pairing_code", "");
    if (sock && !hasCompletedPairHandshake(sock.authState.creds)) {
      void issuePairingCode(sock);
    }
  } else if (sock && pairPhoneDigits() && !hasCompletedPairHandshake(sock.authState.creds) && lastQr) {
    void issuePairingCode(sock);
  }

  const test = takeMetaValue("whatsapp_test");
  if (test) {
    const to = test.startsWith("user:") ? getWhatsAppTo(test.slice(5)) : test === "1" ? null : test;
    try {
      await sendWhatsAppText(
        "Signl1 WhatsApp alerts are linked. If you are reading this, destination routing works.",
        {
          mustBeLinked: true,
          to,
        },
      );
      console.log("[whatsapp] test message sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMeta("whatsapp_error", message);
      console.error(`[whatsapp] test failed: ${message}`);
    }
  }
}

export async function startWhatsAppBridge() {
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack ?? "" : "";
    if (
      message.includes("Cannot read properties of undefined (reading 'id')") &&
      /baileys/i.test(stack)
    ) {
      console.warn("[whatsapp] ignored Baileys pre-login frame (session not linked yet)");
      return;
    }
    console.error("[poller] unhandledRejection", reason);
  });
  console.log(`[whatsapp] Baileys session dir ${whatsappAuthDir()}`);
  await connectWhatsApp();
  setInterval(() => {
    void pumpCommands();
  }, 1_000);
}
