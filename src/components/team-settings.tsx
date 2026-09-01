"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatClock, formatRelative } from "@/lib/format";
import type { AllowedEmail, DeskRole, DeskUser } from "@/lib/access";

type TeamResponse = {
  me: { email: string; name: string | null; image: string | null; role: DeskRole };
  googleConfigured: boolean;
  devLogin: boolean;
  users: DeskUser[];
  pendingInvites: AllowedEmail[];
  error?: string;
};

export function TeamSettings() {
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/team", { cache: "no-store" });
      const data = (await res.json()) as TeamResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to load team");
      setTeam(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function mutate(action: "invite" | "revoke", target: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email: target }),
      });
      const data = (await res.json()) as TeamResponse;
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setTeam(data);
      setEmail("");
      toast.success(action === "invite" ? `Invited ${target}` : `Revoked ${target}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const admin = team?.me.role === "admin";

  return (
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Team
      </div>
      <div className="space-y-4 px-4 py-3 text-[13px]">
        <p className="text-muted-foreground">
          Shared desk: every signed-in operator sees the same inbox, rules, KOL list, and WhatsApp session.
          Google accounts must be invited here before they can sign in.
        </p>
        {error ? <p className="text-destructive">{error}</p> : null}
        {!team ? (
          <p className="text-muted-foreground">Loading team…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant={team.googleConfigured ? "secondary" : "outline"}>
                Google {team.googleConfigured ? "ready" : "not configured"}
              </Badge>
              {team.devLogin ? <Badge variant="outline">Local email login on</Badge> : null}
            </div>
            <div className="overflow-x-auto rounded-md border border-border/70">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/40 text-[11px] tracking-wider text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Operator</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Last login</th>
                    {admin ? <th className="px-3 py-2 font-medium"> </th> : null}
                  </tr>
                </thead>
                <tbody>
                  {team.users.map((user) => (
                    <tr key={user.id} className="border-t border-border/60">
                      <td className="px-3 py-2">
                        <div className="font-medium">{user.name || user.email}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{user.email}</div>
                      </td>
                      <td className="px-3 py-2 capitalize">{user.role}</td>
                      <td className="px-3 py-2 text-muted-foreground" title={formatClock(user.lastLoginAt)}>
                        {formatRelative(user.lastLoginAt)}
                      </td>
                      {admin ? (
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => mutate("revoke", user.email)}
                          >
                            Revoke
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {team.pendingInvites.map((invite) => (
                    <tr key={invite.email} className="border-t border-border/60">
                      <td className="px-3 py-2">
                        <div className="font-mono text-[12px]">{invite.email}</div>
                        <div className="text-[11px] text-muted-foreground">
                          Invited {formatRelative(invite.invitedAt)}
                          {invite.invitedBy ? ` by ${invite.invitedBy}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">Pending</td>
                      <td className="px-3 py-2 text-muted-foreground">—</td>
                      {admin ? (
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => mutate("revoke", invite.email)}
                          >
                            Remove
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {admin ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("invite", email);
                }}
              >
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="operator@gmail.com"
                  className="sm:flex-1"
                />
                <Button type="submit" disabled={busy}>
                  Invite Google account
                </Button>
              </form>
            ) : (
              <p className="text-[12px] text-muted-foreground">Only admins can invite or revoke operators.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
