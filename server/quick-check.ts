import {
  isFreeMailHost,
  isKnownGoodHost,
  isOfficialSuffix,
} from "./known-domains.ts";
import type { ParsedEmail, QuickCheckResult, RedFlagType, RiskLabel } from "./schema.ts";
import { scoreToLabel } from "./schema.ts";

interface Rule {
  type: RedFlagType;
  points: number;
  re: RegExp;
  label: string;
}

const RULES: Rule[] = [
  {
    type: "urgency",
    points: 15,
    re: /\b(immediately|urgent|today|within\s*24\s*hours|last\s*chance|act\s*now|expires?\s*(soon|today)|asap|cancel(?:led)?\s*permanently|respond\s+today|fill\s+this\s+form)\b/i,
    label: "Urgency language",
  },
  {
    type: "payment_demand",
    points: 22,
    re: /\b(pay|payment|upi|deposit|transfer|processing\s*fee|registration\s*fee|confirm.{0,20}fee)\b|₹\s*\d|rs\.?\s*\d/i,
    label: "Payment demand",
  },
  {
    type: "credential_request",
    points: 30,
    re: /\b(otp|one[-\s]?time\s*password|password|passcode|aadhaar|aadhar|pan\s*card|cvv|pin\s*number|bank\s*details|account\s*number|net\s*banking)\b/i,
    label: "Credential / PII request",
  },
  {
    type: "unrealistic_reward",
    points: 18,
    re: /\b(guaranteed\s*(internship|placement|scholarship)|free\s*(laptop|iphone|macbook)|you\s*have\s*been\s*selected|congratulations.{0,40}(won|shortlisted)|lock\s*your\s*seat)\b/i,
    label: "Unrealistic reward / selection",
  },
  {
    type: "fake_authority",
    points: 10,
    re: /\b(scholarship\s*board|ministry\s+of|university\s*grants?|national\s+merit\s+scholarship|official\s*notice\s+from)\b/i,
    label: "Authority / official framing",
  },
  {
    type: "unknown_link",
    points: 20,
    re: /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|shorturl|tiny\.cc)\b|click\s+(this\s+)?link\s+(immediately|now|to)|verify\s+(here|now)\b/i,
    label: "Link pressure / shortener",
  },
];

const SHORTENER_HOST =
  /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|tiny\.cc|shorturl\.at)$/i;

function lookalikeHint(claimed: string, host: string): boolean {
  // crude: host contains org-ish tokens but wrong TLD / extra hyphens
  const tokens = claimed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 5);
  if (!tokens.length) return false;
  const h = host.toLowerCase();
  const hit = tokens.some((t) => h.includes(t));
  if (!hit) return false;
  return !isOfficialSuffix(h) && !isKnownGoodHost(h);
}

/** Fast heuristic scorer — no LLM, no network. */
export function quickCheck(parsed: ParsedEmail): QuickCheckResult {
  const text = parsed.raw;
  const flags: QuickCheckResult["flags"] = [];
  let score = 0;

  const add = (type: RedFlagType, snippet: string, points: number) => {
    flags.push({ type, snippet: snippet.slice(0, 120), points });
    score += points;
  };

  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) add(rule.type, m[0], rule.points);
  }

  // UPI IDs in body (personal payment channel)
  if (parsed.upiIds?.length) {
    add("payment_demand", parsed.upiIds[0]!, 18);
  }

  // Shortened or non-official links with payment/urgency pressure
  for (const host of parsed.urlHosts ?? []) {
    if (SHORTENER_HOST.test(host)) {
      add("unknown_link", host, 15);
      break;
    }
  }

  const hasRiskyLink = (parsed.urls ?? []).some((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (SHORTENER_HOST.test(host)) return true;
      return !isKnownGoodHost(host) && !isOfficialSuffix(host);
    } catch {
      return true;
    }
  });

  const pressure = /\b(pay|payment|click|confirm|verify|eligibility|processing\s*fee)\b/i.test(text);
  if (hasRiskyLink && pressure && (parsed.urls?.length ?? 0) > 0) {
    // avoid double-counting if shortener already flagged
    if (!flags.some((f) => f.type === "unknown_link" && SHORTENER_HOST.test(f.snippet))) {
      add("unknown_link", parsed.urls[0] ?? "link", 12);
    }
  }

  // Sender: free mail claiming authority / scholarship
  const domain = parsed.fromDomain;
  if (domain && isFreeMailHost(domain) && /\b(scholarship|placement|ministry|university|official|hr\b)/i.test(text)) {
    add("sender_mismatch", parsed.from ?? domain, 16);
  }

  // Display name org-ish but free-mail From
  if (
    domain &&
    isFreeMailHost(domain) &&
    parsed.fromDisplayName &&
    /\b(college|university|scholarship|placement|accounts|registrar|ministry)\b/i.test(parsed.fromDisplayName)
  ) {
    add("sender_mismatch", parsed.fromDisplayName, 14);
  }

  // Lookalike domains vs claimed college names in body
  const claimedOrg = text.match(
    /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+(?:College|University|Institute))\b/,
  );
  if (claimedOrg && parsed.urlHosts?.length) {
    for (const host of parsed.urlHosts) {
      if (lookalikeHint(claimedOrg[1]!, host)) {
        add("sender_mismatch", host, 14);
        break;
      }
    }
  }

  // Combo boost: payment + urgency + (reward or shortener) is classic scam stack
  const types = new Set(flags.map((f) => f.type));
  if (types.has("payment_demand") && types.has("urgency") && (types.has("unrealistic_reward") || types.has("unknown_link"))) {
    score += 12;
    flags.push({
      type: "other",
      snippet: "payment + urgency + reward/link stack",
      points: 12,
    });
  }

  // Scholarship/internship + processing fee is high-signal even without other hits
  if (/\b(scholarship|internship|placement)\b/i.test(text) && /\b(processing\s*fee|registration\s*fee|pay\s*₹|pay\s*rs)/i.test(text)) {
    if (!types.has("payment_demand") || score < 45) {
      add("payment_demand", "scholarship/internship fee demand", 15);
    }
  }

  // Discount for clearly official channels without credential/payment red flags
  const officialTone =
    (domain && isKnownGoodHost(domain)) ||
    (parsed.urlHosts ?? []).some((h) => isKnownGoodHost(h)) ||
    /\.edu(\.in)?\b|\.ac\.in\b|\.gov\.in\b/i.test(text);

  const hasHardBad =
    types.has("credential_request") ||
    flags.some((f) => f.type === "unknown_link" && SHORTENER_HOST.test(f.snippet)) ||
    (parsed.upiIds?.length ?? 0) > 0;

  if (officialTone && !hasHardBad && !/\b(otp|password|aadhaar|bit\.ly)\b/i.test(text)) {
    // Soft authority words alone on official domain shouldn't spike risk
    score = Math.max(0, score - 20);
    // Reduce weight of bare "placement cell" style authority on legit ERP mail
    if (
      types.has("fake_authority") &&
      (isKnownGoodHost(domain ?? "") || (parsed.urlHosts ?? []).some(isKnownGoodHost))
    ) {
      score = Math.max(0, score - 8);
    }
  }

  // Legit fee reminders: official domain + fee + explicit anti-scam language
  if (
    officialTone &&
    /\b(erp|semester|tuition)\b/i.test(text) &&
    /\b(never ask|will never|only through the official)\b/i.test(text)
  ) {
    score = Math.max(0, score - 25);
  }

  score = Math.min(100, Math.max(0, score));
  const label: RiskLabel = scoreToLabel(score);

  const summary =
    flags.length === 0
      ? "No strong phishing signals in a quick scan. Deep Investigate can still verify claims online."
      : `Quick scan found ${flags.length} signal(s). Top: ${flags
          .slice()
          .sort((a, b) => b.points - a.points)
          .slice(0, 2)
          .map((f) => f.type.replaceAll("_", " "))
          .join(", ")}.`;

  return { label, score, flags, summary };
}
