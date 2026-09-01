import { describe, expect, it } from "vitest";
import { WATCHLIST_QUERY_BUDGET } from "./config";
import {
  chunkTickersForQuery,
  compileCashtagQuery,
  normalizeTickers,
  rejectedTickers,
} from "./tickers";
import { matchesQuery } from "./query";

describe("normalizeTickers", () => {
  it("strips $, uppercases, de-dupes, and sorts", () => {
    expect(normalizeTickers(["$nvda", "AAPL", " nvda ", "tsla", "not a ticker!!", ""])).toEqual([
      "AAPL",
      "NVDA",
      "TSLA",
    ]);
  });

  it("accepts class shares and mixed paste separators", () => {
    expect(normalizeTickers("brk.b, spy; qqq\nnvda")).toEqual(["BRK.B", "NVDA", "QQQ", "SPY"]);
  });

  it("reports tokens that are not tickers", () => {
    expect(rejectedTickers("NVDA, too_long_to_be_real, $AAPL, !!!")).toEqual(["too_long_to_be_real", "!!!"]);
  });
});

describe("compileCashtagQuery", () => {
  it("adds $ on the backend and wraps multiple names", () => {
    expect(compileCashtagQuery(["aapl"])).toBe("$AAPL lang:en -is:retweet");
    expect(compileCashtagQuery(["nvda", "msft"])).toBe("($MSFT OR $NVDA) lang:en -is:retweet");
  });

  it("chunks before the X recent-search length budget", () => {
    const many = Array.from({ length: 80 }, (_, i) => `T${String(i).padStart(3, "0")}`);
    const chunks = chunkTickersForQuery(many);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(compileCashtagQuery(chunk).length).toBeLessThanOrEqual(WATCHLIST_QUERY_BUDGET);
    }
    expect(chunks.flat()).toEqual(normalizeTickers(many));
  });
});

describe("cashtag matching", () => {
  it("matches $NVDA in tweet text and ignores the bare letters", () => {
    const tweet = {
      text: "Buying more $NVDA into the close. Watching $AAPL.",
      authorHandle: "desk",
      lang: "en",
      isRetweet: false,
    };
    expect(matchesQuery(tweet, compileCashtagQuery(["nvda", "msft"]))).toBe(true);
    expect(matchesQuery({ ...tweet, text: "NVIDIA demand beat, NVDA in the headline" }, compileCashtagQuery(["nvda"]))).toBe(
      false,
    );
  });
});
