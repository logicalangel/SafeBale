/**
 * ChatWindow — message list + compose bar for a single peer.
 *
 * Encryption flow (outbound):
 *   plaintext
 *     → encryptMessage(plaintext, recipientPubKey, ownPubKey)   [DRSAP]
 *     → codex.encodeEncryptedMessage(ciphertextBytes)            [Nahoft]
 *     → sendMessage(transport, persianWords, peer)               [Bale]
 *
 * Decryption flow (inbound):
 *   incoming Bale message text
 *     → codex.decode(text)                                       [Nahoft]
 *     → if type=EncryptedMessage: decryptMessage(raw, privateKey)  [DRSAP]
 *     → if type=Key: storeContactPublicKey()
 *     → else: render as plain text (non-encrypted message)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  loadHistory,
  sendMessage,
  type BalePeer,
  type BaleMessage,
  PeerType,
} from "@baleguard/bale-js";
import {
  encryptMessage,
  decryptMessage,
  createHandshake,
  resolveHandshake,
  isDRSAPHandshake,
  isDRSAPMessage,
  KeyStore,
  KeyOrMessage,
} from "@baleguard/e2e-crypto";
import { useAppContext } from "../context/AppContext.js";

interface DisplayMessage extends BaleMessage {
  displayText: string;
  encrypted: boolean;
}

interface Props {
  peerId: string;
}

export function ChatWindow({ peerId }: Props) {
  const { transport, auth, dialogs, codex } = useAppContext();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [e2eReady, setE2eReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const peer: BalePeer = {
    id: peerId,
    type: PeerType.PRIVATE,
  };

  // ── Decrypt an incoming message text ─────────────────────────────────────
  const processIncomingText = useCallback(
    async (text: string): Promise<{ displayText: string; encrypted: boolean }> => {
      const decoded = codex.decode(text);
      if (!decoded) return { displayText: text, encrypted: false };

      if (decoded.type === KeyOrMessage.Key) {
        // Contact sent us their public key — store it
        await KeyStore.storeContactPublicKey(peerId, decoded.payload);
        setE2eReady(true);
        return { displayText: "🔑 کلید رمزنگاری دریافت شد", encrypted: false };
      }

      if (decoded.type === KeyOrMessage.EncryptedMessage) {
        const pair = await KeyStore.getOrCreateOwnKeyPair();
        const rawDRSAP = new TextDecoder().decode(decoded.payload);
        try {
          const plaintext = await decryptMessage(rawDRSAP, pair.privateKey, true);
          return { displayText: plaintext, encrypted: true };
        } catch {
          return { displayText: "[رمزگشایی ناموفق]", encrypted: true };
        }
      }

      // Fallback: render raw DRSAP string for handshake or plain messages
      if (isDRSAPHandshake(text)) {
        const hs = resolveHandshake(text);
        if (hs) {
          await KeyStore.storeContactPublicKey(peerId, hs.spkiBytes);
          setE2eReady(true);
        }
        return { displayText: "🔑 دست‌دهی کلید امنیتی", encrypted: false };
      }

      return { displayText: text, encrypted: false };
    },
    [peerId, codex]
  );

  // ── Load history on mount / peer change ──────────────────────────────────
  useEffect(() => {
    if (!transport) return;
    setLoading(true);
    setError(null);

    loadHistory(transport, peer)
      .then(async (msgs) => {
        const display = await Promise.all(
          msgs.map(async (m) => ({
            ...m,
            ...(await processIncomingText(m.text)),
          }))
        );
        setMessages(display);

        // Check if we already have a contact key stored
        const existing = await KeyStore.getContactPublicKey(peerId);
        if (existing) setE2eReady(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [transport, peerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send DRSAP handshake (share public key with contact) ─────────────────
  async function handleSendHandshake() {
    if (!transport || auth.status !== "authenticated") return;
    const pair = await KeyStore.getOrCreateOwnKeyPair();
    const handshakeText = await createHandshake(
      auth.userId,
      peerId,
      pair.publicKey
    );
    // Encode the handshake through Nahoft before sending
    const spki = await KeyStore.exportPublicKey(pair.publicKey);
    const encoded = codex.encodeKey(spki);
    await sendMessage(transport, encoded, peer);
  }

  // ── Send encrypted message ────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !transport || auth.status !== "authenticated") return;

    const contactKey = await KeyStore.getContactPublicKey(peerId);
    const pair = await KeyStore.getOrCreateOwnKeyPair();

    let outgoing: string;
    let isEncrypted = false;

    if (contactKey) {
      // Encrypt → DRSAP string → Nahoft encoding → Persian words
      const drsapStr = await encryptMessage(draft, contactKey, pair.publicKey);
      const ciphertextBytes = new TextEncoder().encode(drsapStr);
      outgoing = codex.encodeEncryptedMessage(ciphertextBytes);
      isEncrypted = true;
    } else {
      // No key yet — send as plain text
      outgoing = draft;
    }

    try {
      await sendMessage(transport, outgoing, peer);
      const me = auth.userId;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          senderId: me,
          date: Date.now().toString(),
          text: outgoing,
          displayText: draft,
          encrypted: isEncrypted,
        },
      ]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال ناموفق");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const myId = auth.status === "authenticated" ? auth.userId : "";

  return (
    <div className="chat-window">
      <header className="chat-header">
        <span>{peerId}</span>
        {e2eReady ? (
          <span className="e2e-badge e2e-on" title="رمزنگاری سرتاسر فعال">
            🔒 E2E
          </span>
        ) : (
          <button className="handshake-btn" onClick={handleSendHandshake}>
            🔑 شروع رمزنگاری
          </button>
        )}
      </header>

      <div className="message-list">
        {loading && <p className="loading">در حال بارگذاری…</p>}
        {error && <p className="error">{error}</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`message ${m.senderId === myId ? "outgoing" : "incoming"}`}
          >
            <span className="message-text">{m.displayText}</span>
            {m.encrypted && (
              <span className="lock-icon" title="رمزنگاری‌شده">
                🔒
              </span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="compose-bar" onSubmit={handleSend}>
        <input
          type="text"
          placeholder={e2eReady ? "پیام رمزنگاری‌شده…" : "پیام…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={!draft.trim() || loading}>
          ارسال
        </button>
      </form>
    </div>
  );
}
