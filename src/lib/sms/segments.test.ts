import { describe, it, expect } from "vitest";
import { analyzeMessage, estimateCost, findNonGsmChars, replaceSmartChars } from "./segments";

// ---------------------------------------------------------------------------
// GSM-7 encoding and segment boundaries
// ---------------------------------------------------------------------------

describe("analyzeMessage - GSM-7 encoding", () => {
  it("empty string returns 0 segments", () => {
    const r = analyzeMessage("", false);
    expect(r.charCount).toBe(0);
    expect(r.encoding).toBe("GSM-7");
    expect(r.segmentCount).toBe(0);
    expect(r.isMms).toBe(false);
  });

  it("short GSM-7 message is 1 segment", () => {
    const r = analyzeMessage("Hello world", false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(11);
    expect(r.segmentCount).toBe(1);
  });

  it("exactly 160 GSM-7 chars is 1 segment", () => {
    const msg = "A".repeat(160);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(160);
    expect(r.segmentCount).toBe(1);
  });

  it("161 GSM-7 chars is 2 segments (153 per segment in multipart)", () => {
    const msg = "A".repeat(161);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(161);
    expect(r.segmentCount).toBe(2); // ceil(161/153) = 2
  });

  it("306 GSM-7 chars is 2 segments", () => {
    const msg = "A".repeat(306);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(306);
    expect(r.segmentCount).toBe(2); // ceil(306/153) = 2
  });

  it("307 GSM-7 chars is 3 segments", () => {
    const msg = "A".repeat(307);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(307);
    expect(r.segmentCount).toBe(3); // ceil(307/153) = 3 (153*2=306)
  });

  it("common SMS characters are GSM-7", () => {
    const msg = "Hi Jane! Your appt is at 3:30 PM. Reply STOP to opt out.";
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
  });

  it("newlines are GSM-7", () => {
    const msg = "Line 1\nLine 2\rLine 3";
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
  });
});

// ---------------------------------------------------------------------------
// GSM-7 extended characters (count as 2 each)
// ---------------------------------------------------------------------------

describe("analyzeMessage - GSM-7 extended characters", () => {
  it("caret ^ counts as 2 chars", () => {
    const r = analyzeMessage("^", false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(2);
  });

  it("curly braces count as 2 each", () => {
    const r = analyzeMessage("{}", false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(4);
  });

  it("backslash counts as 2", () => {
    const r = analyzeMessage("\\", false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(2);
  });

  it("euro sign counts as 2", () => {
    const r = analyzeMessage("\u20ac", false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(2);
  });

  it("158 basic chars + 1 extended = 160 = 1 segment", () => {
    const msg = "A".repeat(158) + "^"; // 158 + 2 = 160
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(160);
    expect(r.segmentCount).toBe(1);
  });

  it("159 basic chars + 1 extended = 161 = 2 segments", () => {
    const msg = "A".repeat(159) + "^"; // 159 + 2 = 161
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("GSM-7");
    expect(r.charCount).toBe(161);
    expect(r.segmentCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// UCS-2 encoding (non-GSM characters)
// ---------------------------------------------------------------------------

describe("analyzeMessage - UCS-2 encoding", () => {
  it("single curly quote forces UCS-2", () => {
    const msg = "Hello \u2019world"; // right single quotation mark
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("left double curly quote forces UCS-2", () => {
    const msg = "\u201CHello\u201D"; // left/right double quotation marks
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("em dash forces UCS-2", () => {
    const msg = "word\u2014word"; // em dash
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("en dash forces UCS-2", () => {
    const msg = "10\u201320"; // en dash
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("ellipsis character forces UCS-2", () => {
    const msg = "Wait\u2026"; // horizontal ellipsis
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("registered trademark sign forces UCS-2", () => {
    const msg = "Brand\u00AE"; // registered sign
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("trademark sign forces UCS-2", () => {
    const msg = "Brand\u2122"; // trademark sign
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("emoji forces UCS-2", () => {
    const r = analyzeMessage("Hello \ud83d\ude00", false);
    expect(r.encoding).toBe("UCS-2");
  });

  it("exactly 70 UCS-2 chars is 1 segment", () => {
    const msg = "\u2019".repeat(70);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
    expect(r.charCount).toBe(70);
    expect(r.segmentCount).toBe(1);
  });

  it("71 UCS-2 chars is 2 segments (67 per segment in multipart)", () => {
    const msg = "\u2019".repeat(71);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
    expect(r.charCount).toBe(71);
    expect(r.segmentCount).toBe(2);
  });

  it("134 UCS-2 chars is 2 segments", () => {
    const msg = "\u2019".repeat(134);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
    expect(r.charCount).toBe(134);
    expect(r.segmentCount).toBe(2); // ceil(134/67) = 2
  });

  it("135 UCS-2 chars is 3 segments", () => {
    const msg = "\u2019".repeat(135);
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
    expect(r.charCount).toBe(135);
    expect(r.segmentCount).toBe(3); // ceil(135/67) = 3 (67*2=134)
  });

  it("one non-GSM char in a long message flips entire message to UCS-2", () => {
    // 159 GSM chars + 1 curly quote = 160 UCS-2 chars = 3 segments
    const msg = "A".repeat(159) + "\u2019";
    const r = analyzeMessage(msg, false);
    expect(r.encoding).toBe("UCS-2");
    expect(r.charCount).toBe(160);
    expect(r.segmentCount).toBe(3); // ceil(160/67)
  });
});

// ---------------------------------------------------------------------------
// MMS
// ---------------------------------------------------------------------------

describe("analyzeMessage - MMS", () => {
  it("media attached returns 1 MMS segment regardless of body length", () => {
    const r = analyzeMessage("A".repeat(500), true);
    expect(r.isMms).toBe(true);
    expect(r.segmentCount).toBe(1);
  });

  it("MMS with empty body", () => {
    const r = analyzeMessage("", true);
    expect(r.isMms).toBe(true);
    expect(r.segmentCount).toBe(1);
  });

  it("MMS with Unicode body still returns 1 segment", () => {
    const r = analyzeMessage("\u2019".repeat(200), true);
    expect(r.isMms).toBe(true);
    expect(r.segmentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// estimateCost
// ---------------------------------------------------------------------------

describe("estimateCost", () => {
  const pricing = {
    sms_price_per_segment: 0.0079,
    mms_price: 0.02,
    carrier_fee_per_sms: 0.003,
    carrier_fee_per_mms: 0.01,
  };

  it("SMS cost uses all four pricing values correctly", () => {
    // 1 segment message to 100 recipients
    const r = estimateCost("Hello", false, 100, pricing);
    expect(r.segmentInfo.segmentCount).toBe(1);
    expect(r.segmentInfo.isMms).toBe(false);
    // costPerRecipient = 1 * 0.0079 + 1 * 0.003 = 0.0109
    expect(r.costPerRecipient).toBeCloseTo(0.0109, 4);
    expect(r.totalCost).toBeCloseTo(1.09, 2);
  });

  it("multi-segment SMS multiplies by segment count", () => {
    // 2-segment message to 50 recipients
    const msg = "A".repeat(161); // 2 segments
    const r = estimateCost(msg, false, 50, pricing);
    expect(r.segmentInfo.segmentCount).toBe(2);
    // costPerRecipient = 2 * 0.0079 + 2 * 0.003 = 0.0218
    expect(r.costPerRecipient).toBeCloseTo(0.0218, 4);
    expect(r.totalCost).toBeCloseTo(1.09, 2);
  });

  it("MMS cost ignores segment count, uses flat MMS pricing", () => {
    const r = estimateCost("A".repeat(500), true, 100, pricing);
    expect(r.segmentInfo.isMms).toBe(true);
    // costPerRecipient = 0.02 + 0.01 = 0.03
    expect(r.costPerRecipient).toBeCloseTo(0.03, 4);
    expect(r.totalCost).toBeCloseTo(3.0, 2);
  });

  it("MMS cost does not change with body length", () => {
    const short = estimateCost("Hi", true, 10, pricing);
    const long = estimateCost("A".repeat(1000), true, 10, pricing);
    expect(short.costPerRecipient).toBe(long.costPerRecipient);
  });

  it("zero recipients returns zero cost", () => {
    const r = estimateCost("Hello", false, 0, pricing);
    expect(r.totalCost).toBe(0);
  });

  it("empty body with no media returns zero cost", () => {
    const r = estimateCost("", false, 100, pricing);
    expect(r.segmentInfo.segmentCount).toBe(0);
    expect(r.costPerRecipient).toBe(0);
    expect(r.totalCost).toBe(0);
  });

  it("UCS-2 SMS that would be cheaper as MMS", () => {
    // A long UCS-2 message: 140 chars = ceil(140/67) = 3 segments
    // SMS cost: 3 * (0.0079 + 0.003) = 0.0327
    // MMS cost: 0.02 + 0.01 = 0.03
    // MMS would be cheaper
    const msg = "\u2019".repeat(140);
    const smsCost = estimateCost(msg, false, 1, pricing);
    const mmsCost = estimateCost(msg, true, 1, pricing);
    expect(smsCost.costPerRecipient).toBeGreaterThan(mmsCost.costPerRecipient);
  });

  it("custom pricing values are respected", () => {
    const custom = {
      sms_price_per_segment: 0.01,
      mms_price: 0.05,
      carrier_fee_per_sms: 0.005,
      carrier_fee_per_mms: 0.02,
    };
    const r = estimateCost("Hello", false, 1, custom);
    // 1 * 0.01 + 1 * 0.005 = 0.015
    expect(r.costPerRecipient).toBeCloseTo(0.015, 4);

    const m = estimateCost("Hello", true, 1, custom);
    // 0.05 + 0.02 = 0.07
    expect(m.costPerRecipient).toBeCloseTo(0.07, 4);
  });
});

// ---------------------------------------------------------------------------
// findNonGsmChars
// ---------------------------------------------------------------------------

describe("findNonGsmChars", () => {
  it("returns empty array for pure GSM-7", () => {
    expect(findNonGsmChars("Hello world!")).toEqual([]);
  });

  it("finds curly quotes with correct names", () => {
    const chars = findNonGsmChars("Say \u201Chello\u201D");
    expect(chars).toHaveLength(2);
    expect(chars[0].name).toBe("left double quote");
    expect(chars[0].replaceable).toBe(true);
    expect(chars[1].name).toBe("right double quote");
    expect(chars[1].replaceable).toBe(true);
  });

  it("finds registered sign as non-replaceable", () => {
    const chars = findNonGsmChars("Brand\u00AE");
    expect(chars).toHaveLength(1);
    expect(chars[0].name).toBe("registered sign");
    expect(chars[0].replaceable).toBe(false);
  });

  it("finds em dash and en dash", () => {
    const chars = findNonGsmChars("a\u2014b\u2013c");
    expect(chars).toHaveLength(2);
    expect(chars[0].name).toBe("em dash");
    expect(chars[1].name).toBe("en dash");
  });

  it("finds ellipsis", () => {
    const chars = findNonGsmChars("Wait\u2026");
    expect(chars).toHaveLength(1);
    expect(chars[0].name).toBe("ellipsis");
    expect(chars[0].replaceable).toBe(true);
  });

  it("returns correct indices", () => {
    const chars = findNonGsmChars("AB\u2019CD");
    expect(chars).toHaveLength(1);
    expect(chars[0].index).toBe(2);
    expect(chars[0].char).toBe("\u2019");
  });
});

// ---------------------------------------------------------------------------
// replaceSmartChars
// ---------------------------------------------------------------------------

describe("replaceSmartChars", () => {
  it("replaces curly single quotes with straight", () => {
    expect(replaceSmartChars("it\u2019s")).toBe("it's");
    expect(replaceSmartChars("\u2018hello\u2019")).toBe("'hello'");
  });

  it("replaces curly double quotes with straight", () => {
    expect(replaceSmartChars("\u201CHello\u201D")).toBe('"Hello"');
  });

  it("replaces em and en dashes with hyphens", () => {
    expect(replaceSmartChars("a\u2014b")).toBe("a-b");
    expect(replaceSmartChars("10\u201320")).toBe("10-20");
  });

  it("replaces ellipsis with three dots", () => {
    expect(replaceSmartChars("Wait\u2026")).toBe("Wait...");
  });

  it("leaves registered sign in place (no substitute)", () => {
    expect(replaceSmartChars("Brand\u00AE")).toBe("Brand\u00AE");
  });

  it("cleaned message becomes GSM-7", () => {
    const dirty = "She said \u201Chello\u201D and waited\u2026";
    const clean = replaceSmartChars(dirty);
    const r = analyzeMessage(clean, false);
    expect(r.encoding).toBe("GSM-7");
  });

  it("does not alter already-GSM-7 text", () => {
    const msg = "Hello world! 123";
    expect(replaceSmartChars(msg)).toBe(msg);
  });
});
