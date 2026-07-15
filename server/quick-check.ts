import type { ParsedEmail, QuickCheckResult, RedFlagType, RiskLabel } from "./schema.ts";

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
    re: /\b(immediately|urgent|today|within\s*24\s*hours|last\s*chance|act\s*now|expires?\s*(soon|today)|asap)\b/i,
    label: "Urgency language",
  },
  {
    type: "payment_demand",
    points: 25,
    re: /\b(pay|payment|upi|deposit|transfer|fee|processing\s*fee|registration\s*fee)\b|₹|rs\.?\s*\d/i,
    label: "Payment demand",
  },
  {
    type: "credential_request",
    points: 30,
    re: /\b(otp|password|passcode|aadhaar|aadhar|pan\s*card|cvv|pin\s*number|bank\s*details|account\s*number)\b/i,
    label: "Credential / PII request",
  },
  {
    type: "unrealistic_reward",
    points: 18,
    re: /\b(guaranteed\s*(internship|placement|scholarship)|free\s*(laptop|iphone|macbook)|you\s*have\s*been\s*selected|congratulations.{0,40}won)\b/i,
    label: "Unrealistic reward / selection",
  },
  {
    type: "fake_authority",
    points: 12,
    re: /\b(scholarship\s*board|ministry|university\s*grants?|placement\s*cell|official\s*notice|hr\s*department)\b/i,
    label: "Authority / official framing",
  },
  {
    type: "unknown_link",
    points: 20,
    re: /\b(bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd)\b|click\s+(this\s+)?link|verify\s+(here|now)/i,
    label: "Link pressure / shortener",
  },
];

function scoreToLabel(score: number): RiskLabel {
  if (score >= 70) return "High Risk";
  if (score >= 35) return "Suspicious";
  return "Safe";
}

/** Fast heuristic scorer — no LLM, no network. */
export function quickCheck(parsed: ParsedEmail): QuickCheckResult {
  const text = parsed.raw;
  const flags: QuickCheckResult["flags"] = [];
  let score = 0;

  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) {
      flags.push({ type: rule.type, snippet: m[0], points: rule.points });
      score += rule.points;
    }
  }

  // Extra: non-edu / non-gov link with payment or urgency
  const hasRiskyLink = parsed.urls.some((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return !host.endsWith(".edu") && !host.endsWith(".edu.in") && !host.endsWith(".gov.in") && !host.endsWith(".ac.in");
    } catch {
      return true;
    }
  });
  if (hasRiskyLink && (score >= 15 || parsed.urls.length > 0) && /pay|click|confirm|verify/i.test(text)) {
    flags.push({
      type: "unknown_link",
      snippet: parsed.urls[0] ?? "link",
      points: 10,
    });
    score += 10;
  }

  // Slight discount for clearly official-looking patterns
  if (/\.edu(\.in)?\b|\.ac\.in\b/i.test(text) && !/pay|otp|password/i.test(text)) {
    score = Math.max(0, score - 15);
  }

  score = Math.min(100, Math.max(0, score));
  const label = scoreToLabel(score);

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
