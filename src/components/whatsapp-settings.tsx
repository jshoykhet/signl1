"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
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
      return "Finishing link";
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
    setPairPhone((current) => {
      if (current) return current;
      const digits = (data.to ?? "").replace(/\D/g, "");
      return digits;
    });
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#whatsapp") return;
    document.getElementById("whatsapp")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [wa]);

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

  const toggleAgent = async (agentEnabled: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentEnabled }),
      });
      if (!res.ok) throw new Error("Could not update the agent");
      setWa(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the agent");
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

  const copyCode = async () => {
    if (!wa?.pairingCode) return;
    try {
      await navigator.clipboard.writeText(wa.pairingCode.replace(/\s+/g, ""));
      toast.success("Pairing code copied");
    } catch {
      toast.error("Could not copy the code");
    }
  };

  const linked = wa?.status === "connected";

  return (
    <div id="whatsapp" className="scroll-mt-24">
      <SettingsGroup title="Link">
        {error ? (
          <div className="bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
        ) : null}

        <div
          className={
            linked
              ? "border-b border-border px-4 py-4"
              : "border-b border-border bg-amber-400/16 px-4 py-5"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
                Agent
              </div>
              <div
                className={
                  linked
                    ? "mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-emerald-700 dark:text-emerald-400"
                    : "mt-0.5 text-[20px] font-semibold tracking-[-0.02em] text-amber-950 dark:text-amber-50"
                }
              >
                {wa ? statusLabel(wa.status) : "Loading…"}
              </div>
              {wa?.linkedAs ? (
                <div className="mt-1 text-[14px] text-muted-foreground">{wa.linkedAs}</div>
              ) : (
                <p className="mt-1.5 text-[15px] leading-snug text-amber-950/80 dark:text-amber-50/80">
                  On this phone, use a pairing code. Scanning a QR on the same device does not work.
                </p>
              )}
            </div>
          </div>
        </div>

        {wa?.canLink && !linked ? (
          <div className="space-y-4 border-b border-border px-4 py-5">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em]">Link this phone</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                WhatsApp → Settings → Linked devices → Link with phone number. Enter the code Signl1
                shows below.
              </p>
            </div>
            {wa.pairingCode ? (
              <div className="rounded-2xl bg-amber-400/18 px-4 py-5 text-center">
                <div className="text-[13px] font-medium text-amber-900 dark:text-amber-100">
                  Enter this code in WhatsApp
                </div>
                <div className="mt-2 select-all font-mono text-[34px] leading-none tracking-[0.18em] text-amber-950 dark:text-amber-50">
                  {wa.pairingCode}
                </div>
                <Button
                  type="button"
                  className="mt-4 h-12 w-full min-h-12 text-[16px]"
                  onClick={() => void copyCode()}
                >
                  Copy code
                </Button>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="wa-pair-phone" className="text-[15px]">
                WhatsApp number to link (country code)
              </Label>
              <Input
                id="wa-pair-phone"
                value={pairPhone}
                onChange={(event) => setPairPhone(event.target.value)}
                placeholder="15551234567"
                inputMode="tel"
                autoComplete="tel"
                className="h-12 font-mono text-[17px]"
              />
              <Button
                type="button"
                size="lg"
                className="h-12 w-full min-h-12 text-[16px]"
                disabled={busy || !pairPhone.trim()}
                onClick={() => void pair()}
              >
                {wa.pairingCode ? "Request a new code" : "Get pairing code"}
              </Button>
            </div>
            {wa.qrDataUrl ? (
              <details className="rounded-2xl bg-muted/70 px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium">
                  Have another device? Scan a QR
                </summary>
                <img
                  src={wa.qrDataUrl}
                  alt="WhatsApp link QR code"
                  width={280}
                  height={280}
                  className="mx-auto mt-3 size-64 max-w-full rounded-2xl bg-white p-2"
                />
              </details>
            ) : null}
          </div>
        ) : null}

        <GroupedRow className="flex-col items-stretch sm:flex-row sm:items-start">
          <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">
            Destination
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <Input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="15551234567 or group JID"
              inputMode="tel"
              className="h-12 font-mono text-[16px] sm:h-9 sm:max-w-xs sm:text-[15px]"
              aria-label="WhatsApp destination"
            />
            <Button
              type="button"
              className="h-12 min-h-12 w-full text-[16px] sm:h-8 sm:min-h-8 sm:w-auto sm:text-[13px]"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void saveTo()}
            >
              Save destination
            </Button>
            <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[13px]">
              Number that can ask the agent, with country code. Or a group JID ending in{" "}
              <code className="font-mono text-[12px]">@g.us</code>. Sending to yourself often will
              not notify — look for <span className="text-foreground">Message yourself</span>.
            </p>
          </div>
        </GroupedRow>
        <GroupedRow className="flex-col items-stretch sm:flex-row sm:items-center">
          <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">
            Agent
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="flex items-center gap-3 text-[15px]">
              <Switch
                checked={wa?.agentEnabled ?? true}
                disabled={!wa || busy}
                onCheckedChange={(checked) => void toggleAgent(checked === true)}
              />
              <span className="text-muted-foreground">{wa?.agentEnabled === false ? "Off" : "On"}</span>
            </div>
            <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[13px]">
              How-to lands here the first time you link. After that, text a ticker, @handle, or search.
              Signl1 ranks the last 24 hours on X for high-signal posts and skips content farms. There
              are no scheduled WhatsApp pushes — the agent only replies when you ask. Try{" "}
              <span className="text-foreground">$NVDA</span> or <span className="text-foreground">inbox</span>.
            </p>
            {wa?.lastAgentQuery ? (
              <p className="text-[13px] text-muted-foreground">
                Last ask: {wa.lastAgentQuery}
                {wa.lastAgentAt ? ` · ${formatClock(wa.lastAgentAt)}` : ""}
              </p>
            ) : null}
          </div>
        </GroupedRow>
        <GroupedRow className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">
            Actions
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="h-12 min-h-12 w-full text-[16px] sm:h-8 sm:min-h-8 sm:w-auto sm:text-[13px]"
              size="sm"
              disabled={busy || wa?.status !== "connected"}
              onClick={() => void test()}
            >
              Send test
            </Button>
            {wa?.canLink ? (
              <Button
                type="button"
                className="h-12 min-h-12 w-full text-[16px] sm:h-8 sm:min-h-8 sm:w-auto sm:text-[13px]"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void unlink()}
              >
                Unlink
              </Button>
            ) : (
              <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[13px]">
                Only the owner can link or unlink the sending WhatsApp.
              </p>
            )}
          </div>
        </GroupedRow>
        <GroupedRow className="flex-col items-start sm:flex-row sm:items-center">
          <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">
            Last send
          </div>
          <div className="text-[16px] sm:text-[15px]">{wa?.lastSentAt ? formatClock(wa.lastSentAt) : "None"}</div>
        </GroupedRow>
        {wa?.lastSentTo ? (
          <GroupedRow className="flex-col items-start sm:flex-row sm:items-center">
            <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">
              Sent to
            </div>
            <div className="min-w-0 font-mono text-[14px] break-all sm:text-[13px]">{wa.lastSentTo}</div>
          </GroupedRow>
        ) : null}
        {wa?.lastError ? (
          <div className="bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{wa.lastError}</div>
        ) : null}
      </SettingsGroup>
    </div>
  );
}
