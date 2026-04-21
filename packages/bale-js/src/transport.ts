/**
 * Bale WebSocket transport layer.
 *
 * Mirrors the aiobale client.py WebSocket loop:
 *   connect() → handshake → _listen() with 5-second ping
 *
 * Message routing: incoming frames are dispatched to registered handlers
 * by request ID. Unmatched frames are emitted as "update" events.
 */

import { encodeGrpcFrame, decodeGrpcFrame, encodeMessage } from "./proto.js";
import { BALE_WS_URL } from "./constants.js";

export type MessageHandler = (payload: Uint8Array) => void;
export type UpdateHandler = (payload: Uint8Array) => void;

interface PendingRequest {
  resolve: (data: Uint8Array) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class BaleTransport {
  private ws: WebSocket | null = null;
  private pending = new Map<number, PendingRequest>();
  private seq = 1;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private updateHandlers: UpdateHandler[] = [];
  private authToken: string | null = null;

  onUpdate(handler: UpdateHandler): void {
    this.updateHandlers.push(handler);
  }

  async connect(token?: string): Promise<void> {
    this.authToken = token ?? null;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(BALE_WS_URL);
      ws.binaryType = "arraybuffer";

      ws.onopen = async () => {
        this.ws = ws;
        try {
          await this.#handshake();
          this.#startPing();
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        this.#handleFrame(new Uint8Array(ev.data));
      };

      ws.onerror = () => reject(new Error("WebSocket connection error"));
      ws.onclose = () => this.#cleanup();
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.#cleanup();
  }

  /**
   * Send a gRPC request and await the response frame.
   * @param service  Bale service ID (Services.AUTH / Services.MESSAGING)
   * @param method   Method name string (e.g. "StartPhoneAuth")
   * @param payload  Protobuf-encoded request bytes
   * @param timeoutMs  Response timeout (default 15 s)
   */
  async send(
    service: number,
    method: string,
    payload: Uint8Array,
    timeoutMs = 15_000
  ): Promise<Uint8Array> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const id = this.seq++;

    // Request envelope: [requestId (4 bytes BE)] [serviceId (2 bytes BE)]
    //   [method string length (1 byte)] [method string] [protobuf payload]
    const methodBytes = new TextEncoder().encode(method);
    const header = new Uint8Array(4 + 2 + 1 + methodBytes.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, id, false);
    headerView.setUint16(4, service, false);
    header[6] = methodBytes.length;
    header.set(methodBytes, 7);

    const envelope = new Uint8Array(header.length + payload.length);
    envelope.set(header);
    envelope.set(payload, header.length);

    const frame = encodeGrpcFrame(envelope);
    this.ws.send(frame);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} (${method}) timed out`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId });
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  async #handshake(): Promise<void> {
    if (!this.authToken) return; // pre-auth: no token needed for first request
    // Send auth token in a Bale-specific handshake frame.
    // Format: [0xFF] [token bytes]  (Bale web protocol marker)
    const tokenBytes = new TextEncoder().encode(this.authToken);
    const handshakeFrame = new Uint8Array(1 + tokenBytes.length);
    handshakeFrame[0] = 0xff;
    handshakeFrame.set(tokenBytes, 1);
    this.ws!.send(encodeGrpcFrame(handshakeFrame));
  }

  #startPing(): void {
    // Bale requires a ping every 5 seconds to keep the connection alive
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Empty gRPC frame used as keepalive ping
        this.ws.send(encodeGrpcFrame(new Uint8Array(0)));
      }
    }, 5_000);
  }

  #handleFrame(raw: Uint8Array): void {
    let payload: Uint8Array;
    try {
      payload = decodeGrpcFrame(raw);
    } catch {
      return; // drop malformed frames silently
    }

    if (payload.length < 4) return;

    const view = new DataView(payload.buffer, payload.byteOffset);
    const id = view.getUint32(0, false);
    const body = payload.slice(4);

    const pending = this.pending.get(id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pending.delete(id);
      pending.resolve(body);
    } else {
      // Unsolicited update (new message, etc.)
      for (const handler of this.updateHandlers) {
        handler(body);
      }
    }
  }

  #cleanup(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    // Reject all pending requests
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("WebSocket closed"));
    }
    this.pending.clear();
    this.ws = null;
  }
}

/** Encode a Bale request and send it, returning the raw response bytes. */
export async function sendRequest(
  transport: BaleTransport,
  service: number,
  method: string,
  typePath: string,
  data: object
): Promise<Uint8Array> {
  const payload = encodeMessage(typePath, data);
  return transport.send(service, method, payload);
}
