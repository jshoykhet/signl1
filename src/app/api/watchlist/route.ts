import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import {
  addTickers,
  getWatchlist,
  removeTickers,
  replaceTickers,
  setWatchlistSettings,
} from "@/lib/db";
import { requireDeskUser } from "@/lib/session";
import { rejectedTickers } from "@/lib/tickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json({ watchlist: getWatchlist(desk.userId) });
}

export async function PUT(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tickers?: string[] | string;
      add?: string[] | string;
      remove?: string[] | string;
      enabled?: boolean;
      pollIntervalMs?: number;
    };

    let watchlist = getWatchlist(desk.userId);
    const skipped: string[] = [];

    if (body.tickers !== undefined) {
      skipped.push(...rejectedTickers(body.tickers));
      watchlist = replaceTickers(desk.userId, body.tickers);
    } else {
      if (body.add !== undefined) {
        skipped.push(...rejectedTickers(body.add));
        watchlist = addTickers(desk.userId, body.add);
      }
      if (body.remove !== undefined) {
        watchlist = removeTickers(desk.userId, body.remove);
      }
    }
    if (body.enabled !== undefined || body.pollIntervalMs !== undefined) {
      watchlist = setWatchlistSettings(desk.userId, {
        enabled: body.enabled,
        pollIntervalMs: body.pollIntervalMs,
      });
    }

    return NextResponse.json({ watchlist, skipped });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update watchlist");
  }
}
