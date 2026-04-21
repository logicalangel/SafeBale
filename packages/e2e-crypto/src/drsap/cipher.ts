/**
 * DRSAP (Distributed Ratchet-less Secure Asymmetric Protocol) — upgraded.
 *
 * Improvements over the original ChatGuard implementation:
 *   • RSA-512  → RSA-OAEP 2048-bit (WebCrypto, non-extractable)
 *   • AES-CBC  → AES-GCM 256-bit (authenticated encryption, tamper-evident)
 *   • node-forge removed — pure WebCrypto API only
 *
 * Protocol overview
 * -----------------
 * Handshake (key exchange — sent as a Bale text message):
 *   HANDSHAKE_PREFIX + base64(senderUserId) + ":" + base64(spkiPublicKey)
 *                    + ":" + timestamp + ":" + base64(recipientUserId)
 *
 * Encrypted message (sent as a Bale text message):
 *   ENCRYPT_PREFIX
 *     + base64(RSA-OAEP encrypt(aesKey, recipientPublicKey))
 *     + ":"
 *     + base64(RSA-OAEP encrypt(aesKey, senderPublicKey))   ← sender can also decrypt
 *     + ":"
 *     + base64(iv + AES-GCM ciphertext)
 *
 * The entire encrypted message string is then passed through Codex (Nahoft) to
 * produce a Persian word sequence before being sent via Bale.
 */

export const HANDSHAKE_PREFIX = "BG_HS:";
export const ENCRYPT_PREFIX = "BG_MSG:";

// ---------------------------------------------------------------------------
// Internal crypto helpers
// ---------------------------------------------------------------------------

/** Generate a random 256-bit AES-GCM key (extractable so we can wrap it). */
async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Export a raw AES key to bytes. */
async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

/** Import raw AES-GCM key bytes. */
async function importRawAESKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
}

/** RSA-OAEP encrypt bytes with a public key. */
async function rsaEncrypt(
  data: Uint8Array,
  publicKey: CryptoKey
): Promise<Uint8Array> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, buf)
  );
}

/** RSA-OAEP decrypt bytes with a private key. */
async function rsaDecrypt(
  data: Uint8Array,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, buf)
  );
}

/** AES-GCM encrypt; returns iv (12 bytes) concatenated with ciphertext. */
async function aesEncrypt(
  plaintext: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ptBuf = plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer;
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ptBuf)
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

/** AES-GCM decrypt; first 12 bytes of `data` are the iv. */
async function aesDecrypt(
  data: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)
  );
}

const b64encode = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const b64decode = (s: string): Uint8Array =>
  new Uint8Array([...atob(s)].map((c) => c.charCodeAt(0)));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a handshake payload to send to a contact over Bale.
 * The recipient calls `resolveHandshake()` to extract and store the public key.
 */
export async function createHandshake(
  senderUserId: string,
  recipientUserId: string,
  senderPublicKey: CryptoKey
): Promise<string> {
  const spki = new Uint8Array(
    await crypto.subtle.exportKey("spki", senderPublicKey)
  );
  const parts = [
    btoa(senderUserId),
    b64encode(spki),
    Date.now().toString(),
    btoa(recipientUserId),
  ];
  return HANDSHAKE_PREFIX + parts.join(":");
}

export interface HandshakeData {
  senderUserId: string;
  spkiBytes: Uint8Array;
  timestamp: number;
  recipientUserId: string;
}

/**
 * Parse a handshake string received from Bale.
 * Returns `null` if the string is not a valid DRSAP handshake.
 */
export function resolveHandshake(raw: string): HandshakeData | null {
  if (!raw.startsWith(HANDSHAKE_PREFIX)) return null;
  const parts = raw.slice(HANDSHAKE_PREFIX.length).split(":");
  if (parts.length !== 4) return null;

  const [senderB64, spkiB64, tsStr, recipientB64] = parts as [
    string,
    string,
    string,
    string,
  ];

  try {
    return {
      senderUserId: atob(senderB64),
      spkiBytes: b64decode(spkiB64),
      timestamp: parseInt(tsStr, 10),
      recipientUserId: atob(recipientB64),
    };
  } catch {
    return null;
  }
}

/**
 * Encrypt a plaintext message for a specific recipient.
 *
 * @param plaintext       UTF-8 message string
 * @param recipientKey    Recipient's RSA-OAEP public key
 * @param senderKey       Sender's own RSA-OAEP public key (for self-decryption)
 * @returns               Opaque DRSAP-encoded string (ready for Nahoft encoding)
 */
export async function encryptMessage(
  plaintext: string,
  recipientKey: CryptoKey,
  senderKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const aesKey = await generateAESKey();
  const rawAES = await exportRawKey(aesKey);

  const [wrappedForRecipient, wrappedForSender, ivAndCt] = await Promise.all([
    rsaEncrypt(rawAES, recipientKey),
    rsaEncrypt(rawAES, senderKey),
    aesEncrypt(plaintextBytes, aesKey),
  ]);

  return (
    ENCRYPT_PREFIX +
    [
      b64encode(wrappedForRecipient),
      b64encode(wrappedForSender),
      b64encode(ivAndCt),
    ].join(":")
  );
}

/**
 * Decrypt a DRSAP-encoded string.
 *
 * @param raw             DRSAP string (after Nahoft decoding)
 * @param privateKey      Recipient's (or sender's) RSA-OAEP private key
 * @param isRecipient     true = use first slot, false = use second (sender) slot
 */
export async function decryptMessage(
  raw: string,
  privateKey: CryptoKey,
  isRecipient: boolean
): Promise<string> {
  if (!raw.startsWith(ENCRYPT_PREFIX)) {
    throw new Error("Not a DRSAP encrypted message");
  }
  const parts = raw.slice(ENCRYPT_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed DRSAP message");

  const [slot0, slot1, ivCtB64] = parts as [string, string, string];

  const wrappedAES = b64decode(isRecipient ? slot0 : slot1);
  const rawAES = await rsaDecrypt(wrappedAES, privateKey);
  const aesKey = await importRawAESKey(rawAES);
  const plaintext = await aesDecrypt(b64decode(ivCtB64), aesKey);

  return new TextDecoder().decode(plaintext);
}

/** Returns true if the raw string looks like a DRSAP handshake. */
export const isDRSAPHandshake = (s: string): boolean =>
  s.startsWith(HANDSHAKE_PREFIX);

/** Returns true if the raw string looks like a DRSAP encrypted message. */
export const isDRSAPMessage = (s: string): boolean =>
  s.startsWith(ENCRYPT_PREFIX);
