import type { ParsedEmail } from "./schema.ts";
import { displayName, fromDomain, hostnameOf } from "./known-domains.ts";

const URL_RE = /https?:\/\/[^\s<>"'\)\]]+/gi;
const AMOUNT_RE =
  /(?:₹|rs\.?|inr|usd|\$)\s*[\d,]+(?:\.\d+)?|\b[\d,]+\s*(?:rupees?|rs\.?)\b/gi;
/** UPI VPA-like patterns (user@psp). */
const UPI_RE =
  /\b[a-zA-Z0-9._-]{2,60}@(?:ybl|okaxis|okhdfcbank|okicici|oksbi|paytm|upi|ibl|axl|apl|waaxis|wahdfcbank|ptyes|ptsbi|ptaxis)\b/gi;

function headerValue(raw: string, name: string): string | undefined {
  const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "im");
  const m = raw.match(re);
  return m?.[1]?.trim();
}

/** Strip simple HTML to readable text for pasted rich emails.
 *  Skips plain MIME pastes so From: Name <email@host> is preserved. */
export function stripHtml(input: string): string {
  // Only strip when real HTML elements are present (not email angle brackets)
  if (!/<\/?(?:html|body|div|p|br|a|span|table|tr|td|th|h[1-6]|style|script|img|ul|ol|li|font|center|strong|em|b|i)\b/i.test(input)) {
    return input;
  }
  let s = input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi, "$1 ")
    .replace(/<\/?(?:html|body|div|p|br|a|span|table|tr|td|th|h[1-6]|style|script|img|ul|ol|li|font|center|strong|em|b|i)(?:\s[^>]*)?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

export function cleanUrl(u: string): string {
  let out = u.replace(/[.,;:!?)\]]+$/, "");
  try {
    const parsed = new URL(out);
    // Drop common tracking params for cleaner display / agent prompts
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    const qs = parsed.searchParams.toString();
    out = `${parsed.origin}${parsed.pathname}${qs ? `?${qs}` : ""}${parsed.hash}`;
  } catch {
    /* keep cleaned string */
  }
  return out;
}

/** Split rough headers from body when the user pastes a full email. */
export function parseEmail(rawInput: string): ParsedEmail {
  const raw = stripHtml(rawInput.replace(/\r\n/g, "\n")).trim();
  const lines = raw.split("\n");

  let headerEnd = 0;
  let sawHeader = false;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i] ?? "";
    if (/^(from|to|subject|date|cc|bcc|reply-to)\s*:/i.test(line)) {
      sawHeader = true;
      headerEnd = i + 1;
      continue;
    }
    if (sawHeader && (line.trim() === "" || /^\s+/.test(line))) {
      // continuation or blank after headers
      if (line.trim() === "") {
        headerEnd = i + 1;
        break;
      }
      headerEnd = i + 1;
      continue;
    }
    if (sawHeader) {
      break;
    }
  }

  const headerBlock = sawHeader ? lines.slice(0, headerEnd).join("\n") : "";
  const body = sawHeader ? lines.slice(headerEnd).join("\n").trim() : raw;

  const urls = [
    ...new Set((raw.match(URL_RE) ?? []).map((u) => cleanUrl(u))),
  ];
  const amounts = [...new Set(raw.match(AMOUNT_RE) ?? [])];
  const upiIds = [...new Set((raw.match(UPI_RE) ?? []).map((x) => x.toLowerCase()))];

  const from = headerValue(headerBlock || raw, "From");
  const replyTo = headerValue(headerBlock || raw, "Reply-To");

  return {
    raw,
    from,
    to: headerValue(headerBlock || raw, "To"),
    subject: headerValue(headerBlock || raw, "Subject"),
    date: headerValue(headerBlock || raw, "Date"),
    replyTo,
    fromDomain: fromDomain(from) ?? undefined,
    fromDisplayName: displayName(from) ?? undefined,
    body,
    urls,
    amounts,
    upiIds,
    urlHosts: urls.map((u) => hostnameOf(u)).filter((h): h is string => Boolean(h)),
  };
}

export function formatParsedForPrompt(parsed: ParsedEmail): string {
  const lines = [
    parsed.from ? `From: ${parsed.from}` : null,
    parsed.fromDomain ? `From domain: ${parsed.fromDomain}` : null,
    parsed.replyTo ? `Reply-To: ${parsed.replyTo}` : null,
    parsed.to ? `To: ${parsed.to}` : null,
    parsed.subject ? `Subject: ${parsed.subject}` : null,
    parsed.date ? `Date: ${parsed.date}` : null,
    parsed.urls.length ? `URLs found: ${parsed.urls.join(", ")}` : "URLs found: (none)",
    parsed.urlHosts?.length ? `URL hosts: ${parsed.urlHosts.join(", ")}` : null,
    parsed.amounts.length ? `Money amounts: ${parsed.amounts.join(", ")}` : null,
    parsed.upiIds?.length ? `UPI IDs: ${parsed.upiIds.join(", ")}` : null,
    "",
    "--- BODY ---",
    parsed.body || "(empty)",
  ].filter((x) => x !== null);

  return lines.join("\n");
}
