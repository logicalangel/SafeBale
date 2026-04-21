/**
 * Tests for DRSAP cipher helpers.
 *
 * These tests use the native WebCrypto API available in Node 20+ via
 * `globalThis.crypto` — no polyfills required.
 *
 * RSA-OAEP key generation (2048-bit) is slow; key pairs are shared across
 * the describe blocks via `beforeAll`.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  HANDSHAKE_PREFIX,
  ENCRYPT_PREFIX,
  isDRSAPHandshake,
  isDRSAPMessage,
  resolveHandshake,
  createHandshake,
  encryptMessage,
  decryptMessage,
} from "./cipher.js";

// ---------------------------------------------------------------------------
// Shared key pairs (generated once for the full suite)
// ---------------------------------------------------------------------------

let senderKeyPair: CryptoKeyPair;
let recipientKeyPair: CryptoKeyPair;

beforeAll(async () => {
  const rsaParams: RsaHashedKeyGenParams = {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };
  [senderKeyPair, recipientKeyPair] = await Promise.all([
    crypto.subtle.generateKey(rsaParams, true, ["encrypt", "decrypt"]),
    crypto.subtle.generateKey(rsaParams, true, ["encrypt", "decrypt"]),
  ]);
}, 30_000); // allow up to 30 s for slow environments

// ---------------------------------------------------------------------------
// Prefix predicates
// ---------------------------------------------------------------------------

describe("isDRSAPHandshake", () => {
  it("returns true when string starts with the handshake prefix", () => {
    expect(isDRSAPHandshake(HANDSHAKE_PREFIX + "anything")).toBe(true);
  });

  it("returns false for a message-prefixed string", () => {
    expect(isDRSAPHandshake(ENCRYPT_PREFIX + "anything")).toBe(false);
  });

  it("returns false for an arbitrary string", () => {
    expect(isDRSAPHandshake("hello world")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isDRSAPHandshake("")).toBe(false);
  });
});

describe("isDRSAPMessage", () => {
  it("returns true when string starts with the encrypt prefix", () => {
    expect(isDRSAPMessage(ENCRYPT_PREFIX + "anything")).toBe(true);
  });

  it("returns false for a handshake-prefixed string", () => {
    expect(isDRSAPMessage(HANDSHAKE_PREFIX + "anything")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isDRSAPMessage("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveHandshake
// ---------------------------------------------------------------------------

describe("resolveHandshake", () => {
  it("returns null for a plain string with no prefix", () => {
    expect(resolveHandshake("no prefix here")).toBeNull();
  });

  it("returns null for a message-prefixed string", () => {
    expect(resolveHandshake(ENCRYPT_PREFIX + "data")).toBeNull();
  });

  it("returns null for a handshake with too few parts (< 4)", () => {
    // Only 2 colon-separated segments after the prefix
    expect(resolveHandshake(HANDSHAKE_PREFIX + "aaa:bbb:ccc")).toBeNull();
  });

  it("returns null for a handshake with too many parts (> 4)", () => {
    expect(
      resolveHandshake(HANDSHAKE_PREFIX + "aaa:bbb:ccc:ddd:eee")
    ).toBeNull();
  });

  it("returns null for a handshake with invalid base64", () => {
    // Third segment (timestamp) is a number — first two must be valid base64
    expect(
      resolveHandshake(HANDSHAKE_PREFIX + "!!!:!!!:" + Date.now() + ":!!!")
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createHandshake + resolveHandshake roundtrip
// ---------------------------------------------------------------------------

describe("createHandshake / resolveHandshake roundtrip", () => {
  it("produces a string that starts with the handshake prefix", async () => {
    const hs = await createHandshake("alice", "bob", senderKeyPair.publicKey);
    expect(isDRSAPHandshake(hs)).toBe(true);
  });

  it("roundtrips senderUserId", async () => {
    const hs = await createHandshake("alice", "bob", senderKeyPair.publicKey);
    expect(resolveHandshake(hs)!.senderUserId).toBe("alice");
  });

  it("roundtrips recipientUserId", async () => {
    const hs = await createHandshake("alice", "bob", senderKeyPair.publicKey);
    expect(resolveHandshake(hs)!.recipientUserId).toBe("bob");
  });

  it("roundtrips the SPKI public-key bytes", async () => {
    const expectedSpki = new Uint8Array(
      await crypto.subtle.exportKey("spki", senderKeyPair.publicKey)
    );
    const hs = await createHandshake("alice", "bob", senderKeyPair.publicKey);
    expect(resolveHandshake(hs)!.spkiBytes).toEqual(expectedSpki);
  });

  it("includes a numeric timestamp", async () => {
    const before = Date.now();
    const hs = await createHandshake("alice", "bob", senderKeyPair.publicKey);
    const after = Date.now();
    const ts = resolveHandshake(hs)!.timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// encryptMessage + decryptMessage
// ---------------------------------------------------------------------------

describe("encryptMessage / decryptMessage", () => {
  const plaintext = "خطای ناشناخته — Hello DRSAP 🔑";

  it("produces a string starting with the encrypt prefix", async () => {
    const enc = await encryptMessage(
      plaintext,
      recipientKeyPair.publicKey,
      senderKeyPair.publicKey
    );
    expect(isDRSAPMessage(enc)).toBe(true);
  });

  it("recipient (isRecipient=true) can decrypt", async () => {
    const enc = await encryptMessage(
      plaintext,
      recipientKeyPair.publicKey,
      senderKeyPair.publicKey
    );
    const dec = await decryptMessage(enc, recipientKeyPair.privateKey, true);
    expect(dec).toBe(plaintext);
  });

  it("sender (isRecipient=false) can self-decrypt", async () => {
    const enc = await encryptMessage(
      plaintext,
      recipientKeyPair.publicKey,
      senderKeyPair.publicKey
    );
    const dec = await decryptMessage(enc, senderKeyPair.privateKey, false);
    expect(dec).toBe(plaintext);
  });

  it("different plaintexts produce different ciphertexts (AES-GCM randomness)", async () => {
    const enc1 = await encryptMessage(
      "message one",
      recipientKeyPair.publicKey,
      senderKeyPair.publicKey
    );
    const enc2 = await encryptMessage(
      "message two",
      recipientKeyPair.publicKey,
      senderKeyPair.publicKey
    );
    expect(enc1).not.toBe(enc2);
  });

  it("decryptMessage throws for a non-DRSAP string", async () => {
    await expect(
      decryptMessage("not a drsap message at all", recipientKeyPair.privateKey, true)
    ).rejects.toThrow();
  });

  it("decryptMessage throws for a truncated DRSAP message (too few parts)", async () => {
    const malformed = ENCRYPT_PREFIX + "only-one-part";
    await expect(
      decryptMessage(malformed, recipientKeyPair.privateKey, true)
    ).rejects.toThrow();
  });
});
