/**
 * KeyStore — persists CryptoKey pairs and contact public keys in IndexedDB.
 *
 * Own RSA-OAEP key pair is stored as non-extractable CryptoKey objects so the
 * private key never leaves the browser's key storage.
 *
 * Schema
 * ------
 *   DB: "baleguard-keys"   version: 1
 *   Store "own-key-pair"   keyPath: "id"   (single row, id="default")
 *   Store "contact-keys"   keyPath: "userId"
 */

const DB_NAME = "baleguard-keys";
const DB_VERSION = 1;
const STORE_OWN = "own-key-pair";
const STORE_CONTACTS = "contact-keys";

interface OwnKeyPairRecord {
  id: "default";
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

interface ContactKeyRecord {
  userId: string;
  publicKey: CryptoKey;
  /** ISO-8601 timestamp of when the key was first stored */
  storedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_OWN)) {
        db.createObjectStore(STORE_OWN, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        db.createObjectStore(STORE_CONTACTS, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(store, "readonly")
      .objectStore(store)
      .get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(
  db: IDBDatabase,
  store: string,
  value: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(store, "readwrite")
      .objectStore(store)
      .put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class KeyStore {
  /** Generate (or load existing) RSA-OAEP 2048-bit key pair for this device. */
  static async getOrCreateOwnKeyPair(): Promise<CryptoKeyPair> {
    const db = await openDB();
    const existing = await idbGet<OwnKeyPairRecord>(db, STORE_OWN, "default");
    if (existing) {
      return { publicKey: existing.publicKey, privateKey: existing.privateKey };
    }

    const pair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
        hash: "SHA-256",
      },
      false, // non-extractable: private key never leaves IndexedDB
      ["encrypt", "decrypt"]
    );

    await idbPut(db, STORE_OWN, {
      id: "default",
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
    } satisfies OwnKeyPairRecord);

    return pair;
  }

  /** Export the local public key as SPKI bytes (safe to share). */
  static async exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
    const buf = await crypto.subtle.exportKey("spki", key);
    return new Uint8Array(buf);
  }

  /** Import a contact's SPKI-encoded public key and persist it. */
  static async storeContactPublicKey(
    userId: string,
    spkiBytes: Uint8Array
  ): Promise<CryptoKey> {
    const spkiBuf = spkiBytes.buffer.slice(spkiBytes.byteOffset, spkiBytes.byteOffset + spkiBytes.byteLength) as ArrayBuffer;
    const publicKey = await crypto.subtle.importKey(
      "spki",
      spkiBuf,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
    const db = await openDB();
    await idbPut(db, STORE_CONTACTS, {
      userId,
      publicKey,
      storedAt: new Date().toISOString(),
    } satisfies ContactKeyRecord);
    return publicKey;
  }

  /** Retrieve a previously stored contact public key, or undefined. */
  static async getContactPublicKey(
    userId: string
  ): Promise<CryptoKey | undefined> {
    const db = await openDB();
    const record = await idbGet<ContactKeyRecord>(
      db,
      STORE_CONTACTS,
      userId
    );
    return record?.publicKey;
  }
}
