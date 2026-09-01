import fs from "node:fs";
import type { ConnectionState, WASocket } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { getMeta, getWhatsAppTo, isWhatsAppEnabled, setMeta, takeMetaValue } from "../lib/db";
import {
  hasCompletedPairHandshake,
  isTransientWhatsAppDisconnect,
  shouldDropSyntheticMe,
  userFacingWhatsAppError,
  WA_LOGGED_OUT,
  WA_RESTART_REQUIRED,
} from "../lib/whatsapp-disconnect";
import { formatPairingCode, toWhatsAppJid, whatsappAuthDir } from "../lib/whatsapp";

const log = pino({ level: process.env.WHATSAPP_DEBUG === "1" ? "debug" : "warn" });

let sock: WASocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let socketGen = 0;
let lastQr: string | null = null;
/** Phone we already minted a pairing code for on this socket. QR refresh must not mint another. */
let pairingIssuedForPhone: string | null = null;
let pairingInFlight = false;

function isoNow(): string {
  return new Date().toISOString();
}

function pairPhoneDigits(): string {
  return (getMeta("whatsapp_pair_phone") ?? "").replace(/\D/g, "");
}

function sessionLinked(target: WASocket | null = sock): boolean {
  return Boolean(target?.authState.creds.registered && target.user?.id);
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

function handleConnectionUpdate(gen: number, next: WASocket, update: Partial<ConnectionState>) {
  if (gen !== socketGen) return;
  const { connection, lastDisconnect, qr, isNewLogin } = update;

  if (isNewLogin) {
    console.log("[whatsapp] pairing confirmed; WhatsApp will restart the socket");
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
    connecting = false;
    pairingIssuedForPhone = null;
    lastQr = null;
    const linkedAs = next.user?.id ?? "";
    writeStatus("connected", { qr: "", pairingCode: "", linkedAs, error: "" });
    setMeta("whatsapp_pair_phone", "");
    console.log(`[whatsapp] linked as ${linkedAs || "unknown"}`);
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
        handleConnectionUpdate(gen, next, events["connection.update"]);
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

async function resolveDestinationJid(raw: string): Promise<string> {
  const jid = toWhatsAppJid(raw);
  if (!sock) throw new Error("WhatsApp is not linked");
  if (jid.endsWith("@g.us") || jid.endsWith("@lid") || jid.endsWith("@newsletter")) {
    return jid;
  }
  try {
    const results = await sock.onWhatsApp(jid.replace(/@.+$/, ""));
    const hit = results?.[0];
    if (hit?.exists && hit.jid) return hit.jid;
  } catch {
    /* send to constructed PN JID */
  }
  return jid;
}

export async function sendWhatsAppText(
  text: string,
  options: { mustBeLinked?: boolean } = {},
): Promise<void> {
  if (!isWhatsAppEnabled()) {
    if (options.mustBeLinked) throw new Error("WhatsApp alerts are turned off");
    return;
  }
  if (!sessionLinked()) {
    if (options.mustBeLinked) {
      throw new Error("WhatsApp is not linked yet. Scan the QR or enter the pairing code first.");
    }
    return;
  }
  const to = getWhatsAppTo();
  if (!to) {
    if (options.mustBeLinked) throw new Error("Set a WhatsApp destination number on Settings");
    return;
  }
  const jid = await resolveDestinationJid(to);
  await sock!.sendMessage(jid, { text });
  setMeta("whatsapp_last_sent_at", isoNow());
  setMeta("whatsapp_error", "");
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
    try {
      await sendWhatsAppText(test === "1" ? "Signal1 WhatsApp alerts are linked." : test, {
        mustBeLinked: true,
      });
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
