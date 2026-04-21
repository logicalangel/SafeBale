/**
 * Bale messaging — send/receive messages, load dialogs and history.
 * Mirrors aiobale messaging methods.
 */

import { BaleTransport, sendRequest } from "./transport.js";
import { decodeMessage } from "./proto.js";
import { Services, PeerType } from "./constants.js";
import type { PeerTypeValue } from "./constants.js";

export interface BalePeer {
  id: string;
  type: PeerTypeValue;
  accessHash?: string;
}

export interface BaleMessage {
  id: string;
  senderId: string;
  date: string;
  text: string;
}

export interface BaleDialog {
  peer: BalePeer;
  unreadCount: number;
  topMessageId: string;
}

interface RawMessage {
  id: string;
  senderId: string;
  date: string;
  content?: { textContent?: { text?: string } };
}

interface RawDialog {
  peer?: { id?: string; type?: number; accessHash?: string };
  unreadCount?: number;
  topMessageId?: string;
}

/** Send a plain-text message to a peer. Returns the sent message ID. */
export async function sendMessage(
  transport: BaleTransport,
  text: string,
  peer: BalePeer
): Promise<string> {
  // Use a random 53-bit safe integer as message ID (mirrors aiobale)
  const messageId = String(
    Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
  );

  const responseBytes = await sendRequest(
    transport,
    Services.MESSAGING,
    "SendMessage",
    "messaging.SendMessageRequest",
    {
      peer: {
        id: peer.id,
        type: peer.type,
        accessHash: peer.accessHash ?? "0",
      },
      messageId,
      content: {
        textContent: { text },
      },
    }
  );

  const msg = decodeMessage<RawMessage>(
    "messaging.Message",
    responseBytes
  );
  return msg.id;
}

/** Load recent dialogs (conversation list). */
export async function loadDialogs(
  transport: BaleTransport,
  limit = 30
): Promise<BaleDialog[]> {
  const responseBytes = await sendRequest(
    transport,
    Services.MESSAGING,
    "LoadDialogs",
    "messaging.LoadDialogsRequest",
    { minDate: 0, limit }
  );

  // Response is a repeated Dialog; protobufjs decodes as an array under a root field.
  // We receive raw bytes and parse each dialog.
  const raw = decodeMessage<{ dialogs?: RawDialog[] }>(
    "messaging.LoadDialogsRequest", // reuse as generic container — adjust if needed
    responseBytes
  );

  return (raw.dialogs ?? []).map((d) => ({
    peer: {
      id: d.peer?.id ?? "0",
      type: (d.peer?.type ?? PeerType.PRIVATE) as PeerTypeValue,
      accessHash: d.peer?.accessHash ?? "",
    },
    unreadCount: d.unreadCount ?? 0,
    topMessageId: d.topMessageId ?? "0",
  }));
}

/** Load message history for a peer. */
export async function loadHistory(
  transport: BaleTransport,
  peer: BalePeer,
  limit = 50
): Promise<BaleMessage[]> {
  const responseBytes = await sendRequest(
    transport,
    Services.MESSAGING,
    "LoadHistory",
    "messaging.LoadHistoryRequest",
    {
      peer: {
        id: peer.id,
        type: peer.type,
        accessHash: peer.accessHash ?? "0",
      },
      startId: 0,
      endId: 0,
      limit,
    }
  );

  const raw = decodeMessage<{ messages?: RawMessage[] }>(
    "messaging.LoadHistoryRequest",
    responseBytes
  );

  return (raw.messages ?? []).map((m) => ({
    id: m.id,
    senderId: m.senderId,
    date: m.date,
    text: m.content?.textContent?.text ?? "",
  }));
}
