#!/usr/bin/env tsx
/**
 * Fetches WordScript.kt from the Nahoft repository (MIT licence) and
 * generates packages/e2e-crypto/src/nahoft/word-list.ts
 *
 * Run once during setup:
 *   pnpm setup:wordlist
 *
 * Source: https://github.com/u4i-admin/Nahoft (MIT)
 * "Nahoft" means "hidden" in Persian, created by United for Iran.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORD_SCRIPT_URL =
  "https://raw.githubusercontent.com/u4i-admin/Nahoft/main/app/src/main/java/org/nahoft/codex/WordScript.kt";

const OUT_PATH = resolve(
  __dirname,
  "../packages/e2e-crypto/src/nahoft/word-list.ts"
);

async function fetchWordList(): Promise<void> {
  console.log("Fetching WordScript.kt from u4i-admin/Nahoft …");
  const res = await fetch(WORD_SCRIPT_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const src = await res.text();

  // Extract all quoted Persian strings: "word"
  const words = [...src.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1] ?? "")
    .filter((w) => w.length > 0 && !w.startsWith("org.") && w !== "");

  // Split at the boundary between WordListA and WordListB.
  // WordListA contains the longer words (≥5 chars, alphabetically before WordListB).
  // WordListB starts with short words like آب (2-3 chars).
  // In the Kotlin source WordListA comes first.
  const boundary = words.findIndex((w, i) => i > 100 && w === "آب");
  const wordListA = boundary > 0 ? words.slice(0, boundary) : words;
  const wordListB = boundary > 0 ? words.slice(boundary) : [];

  const banner = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Run \`pnpm setup:wordlist\` to regenerate.
 *
 * Source: https://github.com/u4i-admin/Nahoft (MIT licence)
 * "Nahoft" means "hidden" in Persian, by United for Iran.
 *
 * WordListA: ${wordListA.length} long Persian words
 * WordListB: ${wordListB.length} short Persian words
 * Combined:  ${wordListA.length + wordListB.length} total
 */

`;

  const toTS = (arr: string[], name: string) =>
    `export const ${name}: readonly string[] = [\n${arr.map((w) => `  "${w}",`).join("\n")}\n];\n`;

  const output =
    banner +
    toTS(wordListA, "WORD_LIST_A") +
    "\n" +
    toTS(wordListB, "WORD_LIST_B") +
    `
/** Combined word list used as the encoding alphabet (WordListA + WordListB). */
export const WORD_LIST: readonly string[] = [...WORD_LIST_A, ...WORD_LIST_B];
`;

  writeFileSync(OUT_PATH, output, "utf8");
  console.log(
    `✓ Wrote ${wordListA.length + wordListB.length} words → ${OUT_PATH}`
  );
}

fetchWordList().catch((e) => {
  console.error(e);
  process.exit(1);
});
