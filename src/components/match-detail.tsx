import { Button } from "@/components/ui/button";
import { OpenOnX } from "@/components/open-on-x";
import { formatClock, formatCompact } from "@/lib/format";
import type { Match, UserLabel } from "@/lib/types";

export function MatchDetail({
  match,
  onMark,
  onVote,
  compactActions,
}: {
  match: Match;
  onMark: (id: string, read: boolean) => void;
  onVote: (match: Match, label: UserLabel) => void;
  compactActions?: boolean;
}) {
  return (
    <article className="mx-auto w-full max-w-xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-semibold tracking-[-0.02em] sm:text-[17px]">
            @{match.authorHandle}
          </div>
          <div className="text-[16px] text-muted-foreground sm:text-[15px]">{match.authorName}</div>
        </div>
        {compactActions ? null : (
          <div className="hidden flex-wrap items-center justify-end gap-2 lg:flex">
            <Button variant="ghost" size="sm" onClick={() => onMark(match.id, !match.read)}>
              {match.read ? "Mark unread" : "Mark read"}
            </Button>
            <OpenOnX href={match.permalink} />
          </div>
        )}
      </div>
      <p className="whitespace-pre-wrap text-[18px] leading-[1.5] tracking-[-0.01em] sm:text-[17px] sm:leading-[1.47]">
        {match.text}
      </p>
      <div className="flex flex-col gap-2 lg:hidden">
        <OpenOnX href={match.permalink} size="lg" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={match.userLabel === "high" ? "secondary" : "outline"}
            className="h-12 min-h-12 text-[15px]"
            onClick={() => onVote(match, "high")}
          >
            Keep +
          </Button>
          <Button
            variant={match.userLabel === "low" ? "destructive" : "outline"}
            className="h-12 min-h-12 text-[15px]"
            onClick={() => onVote(match, "low")}
          >
            Hide −
          </Button>
        </div>
        <Button variant="ghost" className="h-11 min-h-11" onClick={() => onMark(match.id, !match.read)}>
          {match.read ? "Mark unread" : "Mark read"}
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[15px] text-muted-foreground sm:text-[13px]">
        <dt>Rule</dt>
        <dd className="text-foreground">{match.ruleName}</dd>
        <dt>Tweet</dt>
        <dd>{formatClock(match.tweetCreatedAt)}</dd>
        <dt>Matched</dt>
        <dd>{formatClock(match.matchedAt)}</dd>
        <dt>Followers</dt>
        <dd>{formatCompact(match.followersCount)}</dd>
        <dt>Likes</dt>
        <dd>{formatCompact(match.likeCount)}</dd>
        <dt>Score</dt>
        <dd>{match.signalScore != null ? match.signalScore : "—"}</dd>
        <dt>Key account</dt>
        <dd className="text-foreground">{match.kol ? "Yes" : "No"}</dd>
        <dt>Label</dt>
        <dd className="text-foreground">
          {match.userLabel === "high" ? "Keep" : match.userLabel === "low" ? "Hide" : "Unlabeled"}
        </dd>
        <dt>Author prior</dt>
        <dd>
          {match.authorPrior.high} high / {match.authorPrior.low} low
        </dd>
        <dt>ID</dt>
        <dd className="tabular-nums">{match.tweetId}</dd>
      </dl>
    </article>
  );
}
