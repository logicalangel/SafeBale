# BaleGuard

**Zero-infrastructure, open-source, E2E encrypted client for [Bale Messenger](https://bale.ai).**

Messages are encrypted on your device before they reach Bale's servers.  
The encrypted output is encoded as natural-looking Persian text using the [Nahoft](https://github.com/u4i-admin/Nahoft) steganographic word-encoding algorithm.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        apps/web  (React + Vite)                 │
│  AuthScreen → ChatScreen → ChatWindow                           │
└────────────────────────┬────────────────────────────────────────┘
                         │  uses
        ┌────────────────┴────────────────┐
        │  packages/e2e-crypto            │  packages/bale-js
        │  ─────────────────────────────  │  ─────────────────────
        │  DRSAP cipher (upgraded):       │  BaleTransport (WS)
        │    RSA-OAEP 2048-bit            │  Auth flow
        │    AES-GCM 256-bit             │  Messaging
        │    WebCrypto only               │  Protobuf encoding
        │  Nahoft encoding                │
        │    BigInt base-conversion       │
        │    10 007 Persian words         │
        │  KeyStore (IndexedDB)           │
        └─────────────────────────────────┘
```

### Outbound flow

```
plaintext
  → encryptMessage()               ← DRSAP: RSA-OAEP + AES-GCM
  → codex.encodeEncryptedMessage() ← Nahoft: ciphertext → Persian words
  → sendMessage()                  ← sent over Bale WebSocket
```

### Inbound flow

```
Persian word string (received from Bale)
  → codex.decode()                 ← Nahoft: words → bytes + type tag
  → decryptMessage()               ← DRSAP: AES-GCM + RSA-OAEP
  → plaintext displayed
```

---

## Crypto design

| Layer | Algorithm | Implementation |
|-------|-----------|----------------|
| Key exchange | RSA-OAEP 2048-bit | WebCrypto API — private key non-extractable in IndexedDB |
| Message encryption | AES-GCM 256-bit, random 96-bit IV | WebCrypto API |
| Steganographic encoding | Nahoft base-conversion (10 007 Persian words) | TypeScript port of [u4i-admin/Nahoft](https://github.com/u4i-admin/Nahoft) (MIT) |

The Nahoft layer provides **plausible deniability**: encrypted messages look like ordinary Persian prose to Bale's servers.

---

## Quick start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Generate the Nahoft word list from the upstream Kotlin source
pnpm setup:wordlist

# 3. Start the dev server
pnpm dev
```

Open `http://localhost:5173`, enter your Iranian phone number, and log in with the SMS code.

### Build for GitHub Pages

```bash
pnpm build
# Output → apps/web/dist/
```

---

## Monorepo layout

```
baleguard/
├── apps/
│   └── web/                    React + Vite front-end
├── packages/
│   ├── e2e-crypto/             Crypto library (Nahoft + DRSAP + KeyStore)
│   └── bale-js/                Bale API client (WebSocket + Protobuf)
└── scripts/
    └── build-word-list.ts      Fetches Nahoft word list from upstream
```

---

## Acknowledgements

- **[Nahoft](https://github.com/u4i-admin/Nahoft)** by United for Iran (MIT) — Persian steganographic word encoding
- **[ChatGuard](https://github.com/RiyaBendig/ChatGuard)** — original DRSAP protocol design (reference only)
- **[aiobale](https://github.com/...)** — Python Bale API client (ported to JS)

---

## Licence

AGPL-3.0 — see [LICENSE](LICENSE).
