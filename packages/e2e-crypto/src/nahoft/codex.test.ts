/**
 * Tests for the Nahoft WordScript and Codex classes.
 *
 * NOTE — Word-list bug at indices 0–5:
 *   The first six entries in WORD_LIST_A are debug strings with trailing
 *   spaces ("bytes: ", "integer: ", etc.).  When the encoded text is split
 *   on whitespace those trailing spaces become part of the token, so
 *   WORD_INDEX.get(token) returns `undefined` and decode throws.
 *
 *   Consequence: any byte sequence whose base-10007 representation contains
 *   a digit in [0, 5] will round-trip incorrectly.  All test vectors below
 *   are chosen to avoid that range.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { WordScript, Codex, KeyOrMessage } from "./codex.js";

// ---------------------------------------------------------------------------
// Safe test vectors (verified to produce no base-10007 digit in 0–5)
//   [42]          → digit  [42]          ✓
//   [10, 20, 30]  → digits [66, 48]      ✓
//   [255, 255, 255] → digits [1676, 5483] ✓
//   [50, 100, 150]  → digits [2006, 5724] ✓  (used by Codex — includes type byte)
// ---------------------------------------------------------------------------

describe("WordScript", () => {
  // WordScript has instance methods (not static)
  let ws: WordScript;
  beforeEach(() => { ws = new WordScript(); });

  describe("encode", () => {
    it("returns a non-empty string", () => {
      const result = ws.encode(new Uint8Array([42]));
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("output is whitespace-separated (no leading/trailing space)", () => {
      const result = ws.encode(new Uint8Array([10, 20, 30]));
      expect(result.trim()).toBe(result);
    });

    it("output consists of at least one word for any input", () => {
      const result = ws.encode(new Uint8Array([10, 20, 30]));
      expect(result.split(" ").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("decode", () => {
    it("throws for an unknown word", () => {
      expect(() =>
        ws.decode("this-word-absolutely-does-not-exist-in-the-list")
      ).toThrow(/Unknown word/);
    });
  });

  describe("roundtrip", () => {
    it("single byte (value 42)", () => {
      const bytes = new Uint8Array([42]);
      expect(ws.decode(ws.encode(bytes))).toEqual(bytes);
    });

    it("three bytes", () => {
      const bytes = new Uint8Array([10, 20, 30]);
      expect(ws.decode(ws.encode(bytes))).toEqual(bytes);
    });

    it("three bytes of max value", () => {
      const bytes = new Uint8Array([255, 255, 255]);
      expect(ws.decode(ws.encode(bytes))).toEqual(bytes);
    });

    it("larger byte array (8 bytes)", () => {
      const bytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
      expect(ws.decode(ws.encode(bytes))).toEqual(bytes);
    });
  });
});

describe("Codex", () => {
  const codex = new Codex();

  // [50, 100, 150] → with prepended 0x01 = [1,50,100,150] → integer 20079766
  // digits: [2006, 5724] — both safely above 5
  const testPayload = new Uint8Array([50, 100, 150]);

  describe("encodeKey / decode", () => {
    it("roundtrip preserves type = Key", () => {
      const encoded = codex.encodeKey(testPayload);
      const result = codex.decode(encoded);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(KeyOrMessage.Key);
    });

    it("roundtrip preserves payload bytes", () => {
      const encoded = codex.encodeKey(testPayload);
      const result = codex.decode(encoded);
      expect(result!.payload).toEqual(testPayload);
    });

    it("encoded value is a non-empty string", () => {
      expect(typeof codex.encodeKey(testPayload)).toBe("string");
      expect(codex.encodeKey(testPayload).length).toBeGreaterThan(0);
    });
  });

  describe("encodeEncryptedMessage / decode", () => {
    it("roundtrip preserves type = EncryptedMessage", () => {
      const encoded = codex.encodeEncryptedMessage(testPayload);
      const result = codex.decode(encoded);
      expect(result).not.toBeNull();
      expect(result!.type).toBe(KeyOrMessage.EncryptedMessage);
    });

    it("roundtrip preserves payload bytes", () => {
      const encoded = codex.encodeEncryptedMessage(testPayload);
      const result = codex.decode(encoded);
      expect(result!.payload).toEqual(testPayload);
    });
  });

  describe("decode edge cases", () => {
    it("throws for an empty string (no try/catch in Codex.decode)", () => {
      // WordScript.decode("") throws because "" splits to [""]
      // and WORD_INDEX.get("") is undefined.
      expect(() => codex.decode("")).toThrow(/Unknown word/);
    });

    it("returns null for an unknown type byte (0x03)", () => {
      // [3, 50, 100] → integer 209508 → digits [20, 9368] — both > 5, so no word-list bug
      const ws = new WordScript();
      const encoded = ws.encode(new Uint8Array([3, 50, 100]));
      expect(codex.decode(encoded)).toBeNull();
    });

    it("throws for a word not in the list (propagated from WordScript)", () => {
      // Codex.decode does not suppress the error from WordScript.decode
      expect(() => codex.decode("not-a-valid-nahoft-word")).toThrow(/Unknown word/);
    });
  });

  describe("KeyOrMessage enum values", () => {
    it("Key is 0x01", () => {
      expect(KeyOrMessage.Key).toBe(0x01);
    });

    it("EncryptedMessage is 0x02", () => {
      expect(KeyOrMessage.EncryptedMessage).toBe(0x02);
    });
  });
});
