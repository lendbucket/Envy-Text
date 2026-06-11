// GSM-7 basic character set
const GSM7_BASIC =
  "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e \u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0";

// Extended GSM-7 characters (each counts as 2)
const GSM7_EXTENDED = "^{}\\[~]|\u20ac";

export interface SegmentInfo {
  charCount: number;
  encoding: "GSM-7" | "UCS-2";
  segmentCount: number;
  isMms: boolean;
}

export function analyzeMessage(body: string, hasMedia: boolean): SegmentInfo {
  if (hasMedia) {
    return {
      charCount: body.length,
      encoding: "GSM-7",
      segmentCount: 1,
      isMms: true,
    };
  }

  if (!body || body.length === 0) {
    return {
      charCount: 0,
      encoding: "GSM-7",
      segmentCount: 0,
      isMms: false,
    };
  }

  // Check encoding
  let isGsm7 = true;
  let gsm7Length = 0;

  for (const char of body) {
    if (GSM7_BASIC.includes(char)) {
      gsm7Length += 1;
    } else if (GSM7_EXTENDED.includes(char)) {
      gsm7Length += 2; // Extended chars count as 2
    } else {
      isGsm7 = false;
      break;
    }
  }

  if (isGsm7) {
    let segmentCount: number;
    if (gsm7Length <= 160) {
      segmentCount = 1;
    } else {
      segmentCount = Math.ceil(gsm7Length / 153);
    }

    return {
      charCount: gsm7Length,
      encoding: "GSM-7",
      segmentCount,
      isMms: false,
    };
  }

  // UCS-2
  const ucs2Length = body.length;
  let segmentCount: number;
  if (ucs2Length <= 70) {
    segmentCount = 1;
  } else {
    segmentCount = Math.ceil(ucs2Length / 67);
  }

  return {
    charCount: ucs2Length,
    encoding: "UCS-2",
    segmentCount,
    isMms: false,
  };
}

export interface CostEstimate {
  segmentInfo: SegmentInfo;
  costPerRecipient: number;
  totalCost: number;
  recipientCount: number;
}

export function estimateCost(
  body: string,
  hasMedia: boolean,
  recipientCount: number,
  pricing: {
    sms_price_per_segment: number;
    mms_price: number;
    carrier_fee_per_sms: number;
    carrier_fee_per_mms: number;
  }
): CostEstimate {
  const segmentInfo = analyzeMessage(body, hasMedia);

  let costPerRecipient: number;
  if (segmentInfo.isMms) {
    costPerRecipient = pricing.mms_price + pricing.carrier_fee_per_mms;
  } else {
    costPerRecipient =
      segmentInfo.segmentCount * pricing.sms_price_per_segment +
      segmentInfo.segmentCount * pricing.carrier_fee_per_sms;
  }

  return {
    segmentInfo,
    costPerRecipient,
    totalCost: costPerRecipient * recipientCount,
    recipientCount,
  };
}
