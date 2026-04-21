/**
 * Nahoft TypeScript port — base-conversion steganographic encoding.
 *
 * Algorithm mirrors u4i-admin/Nahoft (MIT) WordScript.kt + Codex.kt:
 *   encode(bytes):
 *     1. Treat bytes as a BigInteger in base-256
 *     2. Re-encode that integer in base-N (N = word list size)
 *     3. Map each digit to a Persian word
 *
 *   decode(text):
 *     1. Map each Persian word back to a digit
 *     2. Re-encode the resulting BigInteger in base-256
 *     3. Return bytes
 *
 * Codex wraps encode/decode with a 1-byte type prefix:
 *   0x01 = RSA public key  (KeyOrMessage.Key)
 *   0x02 = ciphertext       (KeyOrMessage.EncryptedMessage)
 */

import { WORD_LIST } from "./word-list.js";

// ---------------------------------------------------------------------------
// Internal helpers — pure BigInt base conversion
// ---------------------------------------------------------------------------

/** Treat an array of digits in `base` as a big-endian integer. */
function digitsToInt(digits: readonly number[], base: bigint): bigint {
  let result = 0n;
  for (const d of digits) {
    result = result * base + BigInt(d);
  }
  return result;
}

/**
 * Decompose `n` into digits in `base` (big-endian).
 * Always returns at least one digit (returns [0] for n=0).
 */
function intToDigits(n: bigint, base: bigint): number[] {
  if (n === 0n) return [0];
  const digits: number[] = [];
  while (n > 0n) {
    digits.unshift(Number(n % base));
    n = n / base;
  }
  return digits;
}

// ---------------------------------------------------------------------------
// WordScript — encodes/decodes arbitrary bytes as Persian words
// ---------------------------------------------------------------------------

/** Build word → index lookup once at module load. */
const WORD_INDEX: ReadonlyMap<string, number> = new Map(
  WORD_LIST.map((w, i) => [w, i])
);

const BASE_WORDS = BigInt(WORD_LIST.length); // 10007 in the reference build
const BASE_BYTES = 256n;

export class WordScript {
  /**
   * Encode arbitrary bytes into a space-separated Persian word string.
   * Identical output to WordScript.kt#encode for the same input.
   */
  encode(bytes: Uint8Array): string {
    const byteDigits = Array.from(bytes);
    const integer = digitsToInt(byteDigits, BASE_BYTES);
    const wordDigits = intToDigits(integer, BASE_WORDS);
    return wordDigits
      .map((d) => {
        const word = WORD_LIST[d];
        if (word === undefined) throw new Error(`Word index ${d} out of range`);
        return word;
      })
      .join(" ");
  }

  /**
   * Decode a space-separated Persian word string back to bytes.
   * Identical output to WordScript.kt#decode for the same input.
   */
  decode(ciphertext: string): Uint8Array {
    const words = ciphertext.trim().split(/\s+/);
    const digits = words.map((w) => {
      const idx = WORD_INDEX.get(w);
      if (idx === undefined) throw new Error(`Unknown word: "${w}"`);
      return idx;
    });
    const integer = digitsToInt(digits, BASE_WORDS);
    const byteDigits = intToDigits(integer, BASE_BYTES);
    return new Uint8Array(byteDigits);
  }
}

// ---------------------------------------------------------------------------
// Codex — adds a 1-byte type prefix before encoding
// ---------------------------------------------------------------------------

export const KeyOrMessage = {
  Key: 0x01,
  EncryptedMessage: 0x02,
} as const;

export type KeyOrMessageType = (typeof KeyOrMessage)[keyof typeof KeyOrMessage];

export interface DecodeResult {
  type: KeyOrMessageType;
  payload: Uint8Array;
}

export class Codex {
  private readonly script = new WordScript();

  /** Encode an RSA public key (SPKI bytes) as Persian words. */
  encodeKey(key: Uint8Array): string {
    return this.#encode(KeyOrMessage.Key, key);
  }

  /** Encode AES-GCM ciphertext as Persian words. */
  encodeEncryptedMessage(message: Uint8Array): string {
    return this.#encode(KeyOrMessage.EncryptedMessage, message);
  }

  /**
   * Decode a Persian word string.
   * Returns `null` if the type byte is unrecognised (not 0x01 or 0x02).
   */
  decode(ciphertext: string): DecodeResult | null {
    const data = this.script.decode(ciphertext.trim());
    const typeByte = data[0];
    if (typeByte === undefined) return null;

    if (
      typeByte !== KeyOrMessage.Key &&
      typeByte !== KeyOrMessage.EncryptedMessage
    ) {
      return null;
    }

    return {
      type: typeByte,
      payload: data.slice(1),
    };
  }

  #encode(typeByte: KeyOrMessageType, data: Uint8Array): string {
    const typed = new Uint8Array(1 + data.length);
    typed[0] = typeByte;
    typed.set(data, 1);
    return this.script.encode(typed);
  }
}
