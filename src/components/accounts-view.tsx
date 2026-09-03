"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { HandleTable, type HandleTableItem } from "@/components/handle-table";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DESK_MODES, type DeskMode } from "@/lib/desk-mode";
import { type KolPackId } from "@/lib/kol";

type PackSnapshot = {
  pack: KolPackId;
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  seedCount: number;
  items: HandleTableItem[];
};

type AccountsPage = {
  deskMode: DeskMode;
  markets: PackSnapshot;
  venture: PackSnapshot;
  effectiveCount: number;
};

const PACKS: Record<KolPackId, { label: string; hint: string }> = {
  markets: {
    label: "Markets",
    hint: "Wires, squawk, policy desks, and public-markets talent. Used when Desk tape is Markets, and as half of Both.",
  },
  venture: {
    label: "Venture",
    hint: "Funds, startup reporters, and tech wires. Used when Desk tape is Venture, and as half of Both.",
  },
};

export function AccountsView() {
  const [page, setPage] = useState<AccountsPage | null>(null);
  const [pack, setPack] = useState<KolPackId>("markets");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/kol", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load Key Accounts");
    const data = (await res.json()) as AccountsPage;
    setPage(data);
    setError(null);
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((data) => {
        if (cancelled) return;
        setPack(data.deskMode === "venture" ? "venture" : "markets");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Key Accounts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const onMode = () => {
      void load().catch(() => undefined);
    };
    window.addEventListener("signl1:desk-mode", onMode);
    return () => {
      cancelled = true;
      window.removeEventListener("signl1:desk-mode", onMode);
    };
  }, []);

  const save = async (body: Record<string, unknown>, success?: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/kol", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, pack }),
      });
      const data = (await res.json()) as PackSnapshot & { skipped?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update Key Accounts");
      const full = await load();
      setPage(full);
      const skipped = data.skipped ?? [];
      if (skipped.length) {
        toast.warning(
          `Skipped invalid handles: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}`,
        );
      }
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Key Accounts");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addDraft = async () => {
    const value = draft.trim();
    if (!value) return;
    const ok = await save({ add: value }, "Key Accounts updated");
    if (ok) setDraft("");
  };

  const current = pack === "venture" ? page?.venture : page?.markets;
  const items = current?.items ?? [];
  const deskMode = page?.deskMode ?? "markets";
  const usingThisPack = deskMode === "both" || (deskMode === "venture") === (pack === "venture");

  const suggestions = useMemo(() => {
    const active = new Set((current?.handles ?? []).map((h) => h.toLowerCase()));
    const other = pack === "markets" ? page?.venture.added : page?.markets.added;
    return (other ?? []).filter((handle) => !active.has(handle)).slice(0, 8);
  }, [current?.handles, pack, page]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <PageHeader
          title="Key Accounts"
          description="People whose posts skip the like floor and get a desk bump. Markets and Venture are separate lists — Both desks uses both."
        />
        {error ? (
          <div className="mt-6 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
        ) : null}
        <div className="mt-5 max-w-md">
          <div className="flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Key Accounts list">
            {(["markets", "venture"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pack === id}
                onClick={() => setPack(id)}
                className={
                  pack === id
                    ? "flex-1 rounded-full bg-background px-3 py-1.5 text-[13px] font-medium text-foreground shadow-sm"
                    : "flex-1 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground"
                }
              >
                {PACKS[id].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{PACKS[pack].hint}</p>
        </div>
        <div className="mt-8 grid flex-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="space-y-6">
            <div className="grid gap-2">
              <Label htmlFor="account-draft" className="px-1 text-[13px] font-normal text-muted-foreground">
                Add accounts
              </Label>
              <Textarea
                id="account-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  void addDraft();
                }}
                placeholder={"pmarca, sama, garrytan\n@karpathy"}
                className="min-h-24 rounded-2xl font-mono text-[13px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-[13px] text-muted-foreground">
                  Comma, space, or newline. Enter adds; Shift+Enter for a new line.
                </p>
                <Button size="sm" onClick={() => void addDraft()} disabled={saving || !draft.trim()}>
                  <Plus className="size-3.5" />
                  Add to list
                </Button>
              </div>
            </div>
            {suggestions.length ? (
              <div>
                <div className="mb-2 px-1 text-[13px] text-muted-foreground">On the other list</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((handle) => (
                    <Button
                      key={handle}
                      type="button"
                      variant="outline"
                      size="xs"
                      className="rounded-full font-mono"
                      disabled={saving}
                      onClick={() => void save({ add: handle }, `@${handle} added`)}
                    >
                      @{handle}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <HandleTable
              title={PACKS[pack].label}
              loading={loading && !current}
              loadingLabel="Loading Key Accounts…"
              description="Seeded handles can be removed and restored. Follower counts come from posts already on this desk."
              items={items}
              busy={saving}
              showComposer={false}
              addAriaLabel={`Add ${PACKS[pack].label} handle`}
              onAdd={(raw) => save({ add: raw }, "Key Accounts updated")}
              onRemove={(handle) => void save({ remove: handle }, `@${handle} removed`)}
              onRestore={(handle) => void save({ add: handle }, `@${handle} restored`)}
              onReset={() => void save({ reset: true }, `${PACKS[pack].label} list reset`)}
            />
          </section>
          <section className="space-y-6">
            <SettingsGroup title="This list">
              <GroupedRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-medium tracking-[-0.01em]">
                    {current ? `${current.count} active` : "—"}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    {current
                      ? `${current.seedCount} seeded${current.added.length ? ` · ${current.added.length} added` : ""}${current.removed.length ? ` · ${current.removed.length} removed` : ""}`
                      : "Loading counts…"}
                  </div>
                </div>
              </GroupedRow>
              <GroupedRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-medium tracking-[-0.01em]">
                    {usingThisPack ? "On the tape" : "Not on this desk"}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    Desk tape is {DESK_MODES[deskMode].label}.{" "}
                    {deskMode === "both"
                      ? "Both lists are live."
                      : usingThisPack
                        ? "This list is the one in use."
                        : `Switch Desk tape to ${PACKS[pack].label} or Both to use these handles.`}
                  </div>
                </div>
              </GroupedRow>
            </SettingsGroup>
            <SettingsGroup>
              <GroupedRow>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-medium tracking-[-0.01em]">Desk tape</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                    Change Markets, Both, or Venture on Settings. That picks which Key Accounts lists bump the inbox —
                    it does not rewrite these lists.
                  </div>
                </div>
                <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Settings
                </Link>
              </GroupedRow>
            </SettingsGroup>
            <p className="px-1 text-[13px] leading-5 text-muted-foreground">
              {page ? `${page.effectiveCount} handles currently skip the like floor on this desk.` : null} Nodes-only
              still lives on Settings. Blocked accounts always drop, even if they are on a Key Accounts list.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
