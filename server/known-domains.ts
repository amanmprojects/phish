/**
 * Lightweight known-good domain patterns for Indian colleges / government.
 * Used by quick-check to avoid over-flagging official ERP / edu mail.
 * Not exhaustive — deep investigate still verifies via web when available.
 */

const OFFICIAL_SUFFIXES = [
  ".edu.in",
  ".ac.in",
  ".gov.in",
  ".nic.in",
  ".edu",
] as const;

/** Hosts commonly used by college ERP / admissions (substring match on hostname). */
const KNOWN_GOOD_HOST_PARTS = [
  "vidyavardhini.edu.in",
  "erp.vidyavardhini.edu.in",
  "nptel.ac.in",
  "swayam.gov.in",
  "aicte-india.org",
  "ugc.ac.in",
  "nta.ac.in",
  "digilocker.gov.in",
];

export function hostnameOf(urlOrHost: string): string | null {
  try {
    const u = urlOrHost.includes("://") ? new URL(urlOrHost) : new URL(`https://${urlOrHost}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isOfficialSuffix(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return OFFICIAL_SUFFIXES.some((s) => h.endsWith(s));
}

export function isKnownGoodHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (isOfficialSuffix(h)) return true;
  return KNOWN_GOOD_HOST_PARTS.some((p) => h === p || h.endsWith(`.${p}`) || h.includes(p));
}

/** Free / consumer mail providers often used for spoofed display names. */
export const FREE_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "rediffmail.com",
  "proton.me",
  "protonmail.com",
  "icloud.com",
  "aol.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
]);

export function isFreeMailHost(host: string): boolean {
  return FREE_MAIL_HOSTS.has(host.toLowerCase().replace(/^www\./, ""));
}

/** Extract bare domain from a From: header value. */
export function fromDomain(fromHeader: string | undefined): string | null {
  if (!fromHeader) return null;
  const angle = fromHeader.match(/<([^>]+)>/);
  const addr = (angle?.[1] ?? fromHeader).trim();
  const at = addr.lastIndexOf("@");
  if (at < 0) return null;
  return addr
    .slice(at + 1)
    .toLowerCase()
    .replace(/[>\s].*$/, "")
    .replace(/[.,;]+$/, "");
}

export function displayName(fromHeader: string | undefined): string | null {
  if (!fromHeader) return null;
  const m = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (m?.[1]) return m[1].trim();
  if (!fromHeader.includes("@")) return fromHeader.trim() || null;
  return null;
}
