/**
 * @baleguard/e2e-crypto
 *
 * End-to-end encryption for BaleGuard:
 *   • DRSAP (upgraded) — RSA-OAEP 2048 + AES-GCM 256 via WebCrypto
 *   • Nahoft encoding  — Persian base-conversion steganography
 *   • KeyStore         — IndexedDB key persistence
 *
 * Typical outbound flow:
 *   plaintext
 *     → encryptMessage()         [DRSAP cipher]
 *     → codex.encodeEncryptedMessage()   [Nahoft → Persian words]
 *     → send via Bale
 *
 * Typical inbound flow:
 *   Persian word string (received from Bale)
 *     → codex.decode()           [Nahoft → bytes + type]
 *     → decryptMessage()         [DRSAP cipher]
 *     → plaintext
 */

export { Codex, WordScript, KeyOrMessage } from "./nahoft/codex.js";
export type { DecodeResult } from "./nahoft/codex.js";

export {
  createHandshake,
  resolveHandshake,
  encryptMessage,
  decryptMessage,
  isDRSAPHandshake,
  isDRSAPMessage,
  HANDSHAKE_PREFIX,
  ENCRYPT_PREFIX,
} from "./drsap/cipher.js";
export type { HandshakeData } from "./drsap/cipher.js";

export { KeyStore } from "./storage/key-store.js";
