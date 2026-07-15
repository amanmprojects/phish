import type { ParsedEmail } from "./schema.ts";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const AMOUNT_RE =
  /(?:₹|rs\.?|inr|usd|\$)\s*[\d,]+(?:\.\d+)?|\b[\d,]+\s*(?:rupees?|rs\.?)\b/gi;

function headerValue(raw: string, name: string): string | undefined {
  const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "im");
  const m = raw.match(re);
  return m?.[1]?.trim();
}

/** Split rough headers from body when the user pastes a full email. */
export function parseEmail(rawInput: string): ParsedEmail {
  const raw = rawInput.replace(/\r\n/g, "\n").trim();
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

  const urls = [...new Set((raw.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, "")))];
  const amounts = [...new Set(raw.match(AMOUNT_RE) ?? [])];

  return {
    raw,
    from: headerValue(headerBlock || raw, "From"),
    to: headerValue(headerBlock || raw, "To"),
    subject: headerValue(headerBlock || raw, "Subject"),
    date: headerValue(headerBlock || raw, "Date"),
    body,
    urls,
    amounts,
  };
}

export function formatParsedForPrompt(parsed: ParsedEmail): string {
  const lines = [
    parsed.from ? `From: ${parsed.from}` : null,
    parsed.to ? `To: ${parsed.to}` : null,
    parsed.subject ? `Subject: ${parsed.subject}` : null,
    parsed.date ? `Date: ${parsed.date}` : null,
    parsed.urls.length ? `URLs found: ${parsed.urls.join(", ")}` : "URLs found: (none)",
    parsed.amounts.length ? `Money amounts: ${parsed.amounts.join(", ")}` : null,
    "",
    "--- BODY ---",
    parsed.body || "(empty)",
  ].filter((x) => x !== null);

  return lines.join("\n");
}
