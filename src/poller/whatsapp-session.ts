import fs from "node:fs";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { getMeta, getWhatsAppTo, isWhatsAppEnabled, setMeta, takeMetaValue } from "../lib/db";
import { toWhatsAppJid, whatsappAuthDir } from "../lib/whatsapp";

const log = pino({ level: "silent" });

let sock: WASocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
let pairingRequested = false;

function isoNow(): string {
  return new Date().toISOString();
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

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectWhatsApp();
  }, delayMs);
}

async function connectWhatsApp() {
  if (connecting) return;
  connecting = true;
  pairingRequested = false;
  try {
    fs.mkdirSync(whatsappAuthDir(), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(whatsappAuthDir());
    let version: [number, number, number] | undefined;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (error) {
      console.warn(
        `[whatsapp] could not fetch WA version, using library default: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    writeStatus("connecting", { qr: "", pairingCode: "", error: "" });

    const next = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: log,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    sock = next;

    next.ev.on("creds.update", saveCreds);
    next.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        const pairPhone = getMeta("whatsapp_pair_phone");
        if (pairPhone && !next.authState.creds.registered && !pairingRequested) {
          pairingRequested = true;
          try {
            const code = await next.requestPairingCode(pairPhone.replace(/\D/g, ""));
            writeStatus("pairing", { qr: "", pairingCode: code, error: "" });
            console.log(`[whatsapp] pairing code ${code}`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            writeStatus("error", { error: message });
            console.error(`[whatsapp] pairing failed: ${message}`);
          }
        } else if (!next.authState.creds.registered) {
          writeStatus("qr", { qr, pairingCode: "", error: "" });
        }
      }

      if (connection === "open") {
        const linked = next.user?.id ?? "";
        writeStatus("connected", { qr: "", pairingCode: "", linkedAs: linked, error: "" });
        setMeta("whatsapp_pair_phone", "");
        console.log(`[whatsapp] linked as ${linked || "unknown"}`);
      }

      if (connection === "close") {
        sock = null;
        const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : undefined;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        if (loggedOut) {
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
        const message =
          lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "disconnected";
        writeStatus("connecting", { error: message });
        scheduleReconnect(4_000);
      }
    });
  } catch (error) {
    sock = null;
    const message = error instanceof Error ? error.message : String(error);
    writeStatus("error", { error: message });
    console.error(`[whatsapp] ${message}`);
    scheduleReconnect(8_000);
  } finally {
    connecting = false;
  }
}

async function resolveDestinationJid(raw: string): Promise<string> {
  const jid = toWhatsAppJid(raw);
  if (!sock) throw new Error("WhatsApp is not linked");
  if (jid.endsWith("@g.us") || jid.endsWith("@lid") || jid.endsWith("@newsletter")) {
    return jid;
  }
  try {
    const results = await sock.onWhatsApp(jid);
    const hit = results?.[0];
    if (hit?.exists && hit.jid) return hit.jid;
  } catch {
    /* send to constructed PN JID */
  }
  return jid;
}

export async function sendWhatsAppText(text: string): Promise<void> {
  if (!isWhatsAppEnabled()) return;
  if (!sock) throw new Error("WhatsApp is not linked");
  const to = getWhatsAppTo();
  if (!to) throw new Error("Set a WhatsApp destination number on Settings");
  const jid = await resolveDestinationJid(to);
  await sock.sendMessage(jid, { text });
  setMeta("whatsapp_last_sent_at", isoNow());
  setMeta("whatsapp_error", "");
}

async function pumpCommands() {
  const logout = takeMetaValue("whatsapp_logout");
  if (logout) {
    try {
      if (sock) await sock.logout();
    } catch {
      /* already gone */
    }
    sock = null;
    wipeAuthDir();
    writeStatus("idle", { qr: "", pairingCode: "", linkedAs: "", error: "" });
    pairingRequested = false;
    scheduleReconnect(1_000);
  }

  const pairPhone = getMeta("whatsapp_pair_phone");
  if (pairPhone && sock && !sock.authState.creds.registered && !pairingRequested) {
    pairingRequested = true;
    try {
      const code = await sock.requestPairingCode(pairPhone.replace(/\D/g, ""));
      writeStatus("pairing", { qr: "", pairingCode: code, error: "" });
    } catch (error) {
      pairingRequested = false;
      const message = error instanceof Error ? error.message : String(error);
      writeStatus("error", { error: message });
    }
  }

  const test = takeMetaValue("whatsapp_test");
  if (test) {
    try {
      await sendWhatsAppText(test === "1" ? "Signal1 WhatsApp alerts are linked." : test);
      console.log("[whatsapp] test message sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMeta("whatsapp_error", message);
      console.error(`[whatsapp] test failed: ${message}`);
    }
  }
}

export async function startWhatsAppBridge() {
  console.log(`[whatsapp] Baileys session dir ${whatsappAuthDir()}`);
  await connectWhatsApp();
  setInterval(() => {
    void pumpCommands();
  }, 1_000);
}
