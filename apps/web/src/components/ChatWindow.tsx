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
    <div className="flex h-full flex-col bg-[#0d1117]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#2d3748] bg-[#161b22] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2d3748] text-sm font-semibold text-white">
            {peerId.slice(0, 1).toUpperCase()}
          </div>
          <span className="font-medium text-[#e2e8f0]">{peerId}</span>
        </div>

        {e2eReady ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            E2E فعال
          </span>
        ) : (
          <button
            onClick={handleSendHandshake}
            className="flex items-center gap-1.5 rounded-full bg-blue-600/10 px-3 py-1 text-xs font-medium text-blue-400 ring-1 ring-blue-500/20 transition hover:bg-blue-600/20"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            شروع رمزنگاری
          </button>
        )}
      </header>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <svg className="h-5 w-5 animate-spin text-[#4a5568]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}
        {error && (
          <p className="mx-auto max-w-xs rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400 ring-1 ring-red-500/20">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const isMe = m.senderId === myId;
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                <div
                  className={`group relative max-w-[72%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? "rounded-tr-sm bg-blue-600 text-white"
                      : "rounded-tl-sm bg-[#1e2530] text-[#e2e8f0]"
                  }`}
                >
                  <span>{m.displayText}</span>
                  {m.encrypted && (
                    <svg
                      className={`inline-block h-3 w-3 ms-1.5 opacity-70 ${isMe ? "text-blue-200" : "text-emerald-400"}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-label="رمزنگاری‌شده"
                    >
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Compose bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-[#2d3748] bg-[#161b22] px-4 py-3"
      >
        <input
          type="text"
          placeholder={e2eReady ? "پیام رمزنگاری‌شده…" : "پیام…"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loading}
          className="flex-1 rounded-xl border border-[#2d3748] bg-[#0d1117] px-4 py-2.5 text-sm text-[#e2e8f0] placeholder-[#4a5568] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || loading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="ارسال"
        >
          <svg className="h-4 w-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
