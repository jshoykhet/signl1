import { describe, expect, it } from "vitest";
import { scoreDeskRelevance } from "./desk-relevance";
import { passesSignalFilter } from "./signal-filter";

/**
 * Texts taken from the live 2-day tape. The question is not "did it get likes?"
 * — viral junk had *more* likes and views than useful prints.
 * Markets: would a PM want this on the tape?
 * VC: entertaining or unique information?
 */

const now = Date.parse("2026-09-03T12:00:00.000Z");
const stale = "2026-09-03T10:00:00.000Z";

function q(
  text: string,
  extras: Partial<Parameters<typeof passesSignalFilter>[0]> = {},
): Parameters<typeof passesSignalFilter>[0] {
  return {
    followersCount: 40_000,
    likeCount: 0,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    impressionCount: extras.impressionCount ?? 0,
    verified: false,
    createdAt: stale,
    text,
    authorHandle: "desk_tape",
    ...extras,
  };
}

describe("2-day tape backtest", () => {
  it("keeps Hormuz / Axios / Google antitrust prints at 0 likes", () => {
    const hormuz = passesSignalFilter(
      q(
        "Iran has struck two supertankers carrying Saudi crude oil earlier today while leaving the Strait of Hormuz near Oman, according to Marisks and Kpler.",
        { followersCount: 18_000, authorHandle: "DrNeculai" },
      ),
      now,
    );
    expect(hormuz.pass).toBe(true);

    const axios = passesSignalFilter(
      q(
        "BRENT, US CRUDE FUTURES RISE BY MORE THAN 4% ON AXIOS REPORT THAT US IS CARRYING STRIKES ON IRANIAN TARGETS AROUND STRAIT OF HORMUZ",
        { followersCount: 1_908_326, authorHandle: "DeItaone" },
      ),
      now,
    );
    expect(axios.pass).toBe(true);

    const google = passesSignalFilter(
      q(
        "JUST IN: $GOOGL scored a major win as a judge ruled it will not be forced to sell its ad exchange despite the ad tech monopoly case.",
        { followersCount: 53_816, authorHandle: "Sam_Badawi" },
      ),
      now,
    );
    expect(google.pass).toBe(true);

    const nvidiaRev = passesSignalFilter(
      q(
        "NVIDIA’s physical AI business is already running at about $10 billion in annual revenue, Jensen Huang said.",
        { followersCount: 26_818, authorHandle: "MojoTricks" },
      ),
      now,
    );
    expect(nvidiaRev.pass).toBe(true);
  });

  it("keeps a confidential Moonshot / Kimi HK IPO at 0 likes on the VC desk", () => {
    const moonshot = passesSignalFilter(
      q(
        "Kimi's parent company Moonshot AI has reportedly filed confidentially for a Hong Kong IPO and plans to raise funds at a $50B pre-money valuation.",
        { followersCount: 155_885, authorHandle: "rohanpaul_ai" },
      ),
      now,
      { deskMode: "venture" },
    );
    expect(moonshot.pass).toBe(true);
  });

  it("drops high-engagement trade-call spam a smart investor already ignores", () => {
    const win = passesSignalFilter(
      q(
        "LETS GOOOO I JUST CAUGHT A 150% WIN IN 20 MINUTES!!!! $META CALLS OFF THE VWAP RETEST WHOLE TEAM JUST CRUSHED IT",
        { followersCount: 189_827, likeCount: 21, impressionCount: 8_400 },
      ),
      now,
    );
    expect(win.pass).toBe(false);
    expect(
      scoreDeskRelevance(
        "LETS GOOOO I JUST CAUGHT A 150% WIN IN 20 MINUTES!!!! $META CALLS OFF THE VWAP RETEST",
      ).spam,
    ).toBe(true);

    const join = passesSignalFilter(
      q(
        "SOME OF OUR MONSTER WINNERS FROM TODAY JOIN THE TEAM TODAY AT: example.com $SPY $SPX $AAPL $META",
        { followersCount: 55_073, likeCount: 40, impressionCount: 12_000 },
      ),
      now,
    );
    expect(join.pass).toBe(false);

    const beak = passesSignalFilter(
      q("HOPE THAT $TSLA TRADE WET YOUR BEAKS! WORKS DONE IN 60 MINS. GIVE THIS A heart IF SO!", {
        followersCount: 14_917,
        likeCount: 58,
        impressionCount: 9_200,
      }),
      now,
    );
    expect(beak.pass).toBe(false);
  });

  it("does not treat raw impressions as quality — viral dunks still fail", () => {
    const dunk = passesSignalFilter(
      q("I’d love to have Jody do it.", {
        authorHandle: "vkhosla",
        followersCount: 768_211,
        likeCount: 3_120,
        impressionCount: 132_730,
      }),
      now,
      { deskMode: "venture", watchedAuthor: true },
    );
    expect(dunk.pass).toBe(false);

    const seahawks = passesSignalFilter(
      q("Excited for the @Seahawks home opener", {
        authorHandle: "vkhosla",
        followersCount: 768_211,
        likeCount: 1_707,
        impressionCount: 80_000,
      }),
      now,
      { deskMode: "venture", watchedAuthor: true },
    );
    expect(seahawks.pass).toBe(false);
  });

  it("keeps a watched product tease and drops empty thanks", () => {
    const tease = passesSignalFilter(
      q("A Storm of Cybercabs", {
        authorHandle: "elonmusk",
        followersCount: 241_545_604,
        likeCount: 7_008,
        impressionCount: 993_382,
        verified: true,
      }),
      now,
      { deskMode: "both", watchedAuthor: true },
    );
    expect(tease.pass).toBe(true);

    const thanks = passesSignalFilter(
      q("@MichaelDell Congrats", {
        authorHandle: "elonmusk",
        followersCount: 241_545_604,
        likeCount: 708,
        isReply: true,
      }),
      now,
      { deskMode: "both", watchedAuthor: true },
    );
    expect(thanks.pass).toBe(false);
  });

  it("drops Grok replies even when they recap a print", () => {
    const grok = passesSignalFilter(
      q("Brent is trading near $92/bbl and WTI around $88, both up over 2% today. The jump stems from Hormuz.", {
        authorHandle: "grok",
        followersCount: 9_000_000,
        isReply: true,
        text: "@user Brent is trading near $92/bbl and WTI around $88 on Hormuz supply fears.",
      }),
      now,
    );
    expect(grok.pass).toBe(false);
    expect(grok.reasons).toContain("model reply");
  });

  it("drops VC-rule hits that are not unique insight (politics / LNG on Funding)", () => {
    expect(
      passesSignalFilter(
        q(
          "We have heard the concerns raised by traders. The measures agreed upon must now be implemented.",
          { followersCount: 6_952_811, likeCount: 5, authorHandle: "WilliamsRuto" },
        ),
        now,
        { deskMode: "venture" },
      ).pass,
    ).toBe(false);
    expect(
      passesSignalFilter(
        q(
          "Liquefied natural gas prices in Asia rose to the highest in more than three years after hostilities raised concerns over prolonged disruptions to flows through the Strait of Hormuz",
          { followersCount: 10_431_651, likeCount: 1, authorHandle: "business" },
        ),
        now,
        { deskMode: "venture" },
      ).pass,
    ).toBe(false);
  });
});
