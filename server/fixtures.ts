import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");

export interface FixtureMeta {
  id: string;
  title: string;
  expected: "Safe" | "Suspicious" | "High Risk";
}

const META: Record<string, Omit<FixtureMeta, "id">> = {
  "scholarship-scam": {
    title: "Scholarship fee demand (High Risk)",
    expected: "High Risk",
  },
  "fake-placement": {
    title: "Guaranteed internship + Aadhaar (High Risk)",
    expected: "High Risk",
  },
  "ambiguous-urgency": {
    title: "Internship with odd urgency (Suspicious)",
    expected: "Suspicious",
  },
  "legit-fee-notice": {
    title: "College ERP fee reminder (Safe)",
    expected: "Safe",
  },
  "prompt-injection": {
    title: "Prompt injection attempt (High Risk)",
    expected: "High Risk",
  },
};

export function listFixtures(): FixtureMeta[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => {
      const id = basename(f, ".txt");
      const meta = META[id] ?? {
        title: id,
        expected: "Suspicious" as const,
      };
      return { id, ...meta };
    });
}

export function loadFixture(id: string): string | null {
  const safe = id.replace(/[^a-z0-9-]/gi, "");
  const path = join(FIXTURES_DIR, `${safe}.txt`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}
