"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatClock } from "@/lib/format";
import type { WhatsAppPublicStatus } from "@/lib/whatsapp-status";

function statusLabel(status: WhatsAppPublicStatus["status"]) {
  switch (status) {
    case "connected":
      return "Linked";
    case "qr":
      return "Scan QR";
    case "pairing":
      return "Enter pairing code";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
    default:
      return "Not linked";
  }
}

export function WhatsAppSettings() {
  const [wa, setWa] = useState<WhatsAppPublicStatus | null>(null);
  const [to, setTo] = useState("");
  const [pairPhone, setPairPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/whatsapp", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load WhatsApp status");
    const data = (await res.json()) as WhatsAppPublicStatus;
    setWa(data);
    setTo((current) => (current ? current : data.to ?? ""));
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        await load();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load WhatsApp");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTo = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = (await res.json()) as WhatsAppPublicStatus & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save destination");
      setWa(data);
      toast.success("WhatsApp destination saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save destination");
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Could not update WhatsApp");
      setWa(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update WhatsApp");
    } finally {
      setBusy(false);
    }
  };

  const pair = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: pairPhone }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not request pairing code");
      toast.success("Pairing requested. Enter the code in WhatsApp in a few seconds.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/test", { method: "POST" });
      if (!res.ok) throw new Error("Could not queue test");
      toast.success("Test message queued");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/logout", { method: "POST" });
      if (!res.ok) throw new Error("Could not unlink");
      toast.success("Unlink requested");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlink failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        WhatsApp (Baileys)
      </div>
      {error ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      ) : null}
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 border-b border-border/60 px-4 py-2.5 text-[13px]">
        <div className="text-muted-foreground">Status</div>
        <div className="min-w-0">
          <span className={wa?.status === "connected" ? "text-emerald-400" : "text-amber-300"}>
            {wa ? statusLabel(wa.status) : "Loading…"}
          </span>
          {wa?.linkedAs ? <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{wa.linkedAs}</div> : null}
        </div>
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 border-b border-border/60 px-4 py-2.5 text-[13px]">
        <div className="text-muted-foreground">Send alerts</div>
        <div className="flex items-center gap-2">
          <Switch
            checked={wa?.enabled ?? true}
            disabled={!wa || busy}
            onCheckedChange={(checked) => void toggleEnabled(checked === true)}
          />
          <span className="text-muted-foreground">{wa?.enabled === false ? "Off" : "On"}</span>
        </div>
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 border-b border-border/60 px-4 py-2.5 text-[13px]">
        <div className="text-muted-foreground">Destination</div>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="15551234567 or group JID"
              className="max-w-xs font-mono"
              aria-label="WhatsApp destination"
            />
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveTo()}>
              Save
            </Button>
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Number that should receive alerts, with country code. Or paste a group JID ending in{" "}
            <code className="font-mono text-[11px]">@g.us</code>. Also settable as{" "}
            <code className="font-mono text-[11px]">WHATSAPP_TO</code>.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 border-b border-border/60 px-4 py-3 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="text-muted-foreground">Link device</div>
        <div className="grid gap-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Uses the unofficial WhatsApp Web API from{" "}
            <a className="text-amber-300 underline-offset-4 hover:underline" href="https://baileys.wiki/" target="_blank" rel="noreferrer">
              baileys.wiki
            </a>
            . On your phone: WhatsApp → Settings → Linked devices. Scan the QR, or choose Link with phone number and
            enter the pairing code. Status must read <span className="text-foreground">Linked</span> before alerts or
            a test message will send. Request a pairing code once and wait; Signal1 keeps that code until you request
            another or the phone finishes linking.
          </p>
          {wa?.qrDataUrl ? (
            <img
              src={wa.qrDataUrl}
              alt="WhatsApp link QR code"
              width={280}
              height={280}
              className="size-56 rounded-md bg-white p-2"
            />
          ) : null}
          {wa?.pairingCode ? (
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Pairing code</div>
              <div className="mt-1 font-mono text-2xl tracking-[0.2em] text-amber-200">{wa.pairingCode}</div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="wa-pair-phone">Account to link (country code + number)</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="wa-pair-phone"
                value={pairPhone}
                onChange={(event) => setPairPhone(event.target.value)}
                placeholder="15551234567"
                className="max-w-xs font-mono"
              />
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void pair()}>
                Request pairing code
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy || wa?.status !== "connected"} onClick={() => void test()}>
              Send test
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void unlink()}>
              Unlink
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 px-4 py-2.5 text-[13px]">
        <div className="text-muted-foreground">Last send</div>
        <div>{wa?.lastSentAt ? formatClock(wa.lastSentAt) : "None"}</div>
      </div>
      {wa?.lastError ? (
        <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{wa.lastError}</div>
      ) : null}
    </section>
  );
}
