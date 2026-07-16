const WEB_KEY = "phish.settings.enableWeb";

export function loadEnableWeb(): boolean {
  try {
    const v = localStorage.getItem(WEB_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function saveEnableWeb(on: boolean): void {
  try {
    localStorage.setItem(WEB_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
