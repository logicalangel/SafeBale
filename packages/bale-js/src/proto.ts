/**
 * Minimal Protobuf encoding/decoding for Bale's gRPC messages.
 *
 * Bale uses standard gRPC framing over WebSocket:
 *   [0x00] [4-byte big-endian length] [protobuf bytes]
 *
 * Field aliases match aiobale method definitions (alias="1", alias="2", …).
 * We use protobufjs for runtime encoding/decoding.
 */

import protobuf from "protobufjs";

// ---------------------------------------------------------------------------
// gRPC frame helpers
// ---------------------------------------------------------------------------

/**
 * Wrap protobuf bytes in a gRPC data frame.
 *   Byte 0: 0x00 (no compression)
 *   Bytes 1–4: big-endian uint32 payload length
 *   Bytes 5+: protobuf payload
 */
export function encodeGrpcFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0x00;
  const view = new DataView(frame.buffer);
  view.setUint32(1, payload.length, false); // big-endian
  frame.set(payload, 5);
  return frame;
}

/**
 * Decode a gRPC data frame, returning the inner protobuf payload.
 * Throws if the frame is malformed or uses compression (flag ≠ 0).
 */
export function decodeGrpcFrame(frame: Uint8Array): Uint8Array {
  if (frame.length < 5) throw new Error("gRPC frame too short");
  if (frame[0] !== 0x00) throw new Error("Compressed gRPC frames not supported");
  const view = new DataView(frame.buffer, frame.byteOffset);
  const length = view.getUint32(1, false);
  if (frame.length < 5 + length) throw new Error("gRPC frame truncated");
  return frame.slice(5, 5 + length);
}

// ---------------------------------------------------------------------------
// Lazy-loaded protobuf root (schema built programmatically)
// ---------------------------------------------------------------------------

let _root: protobuf.Root | null = null;

function getRoot(): protobuf.Root {
  if (_root) return _root;

  _root = new protobuf.Root();

  // ── Auth messages ────────────────────────────────────────────────────────
  const authPkg = _root.define("auth");

  authPkg.add(
    new protobuf.Type("StartPhoneAuthRequest")
      .add(new protobuf.Field("phoneNumber", 1, "string"))
      .add(new protobuf.Field("appId", 2, "int32"))
      .add(new protobuf.Field("apiKey", 3, "string"))
      .add(new protobuf.Field("deviceHash", 4, "string"))
      .add(new protobuf.Field("deviceTitle", 5, "string"))
      .add(new protobuf.Field("sendCodeType", 9, "int32"))
  );

  authPkg.add(
    new protobuf.Type("ValidateCodeRequest")
      .add(new protobuf.Field("transactionHash", 1, "string"))
      .add(new protobuf.Field("code", 2, "string"))
  );

  authPkg.add(
    new protobuf.Type("AuthResponse")
      .add(new protobuf.Field("token", 1, "string"))
      .add(new protobuf.Field("userId", 2, "int64"))
  );

  authPkg.add(
    new protobuf.Type("StartPhoneAuthResponse")
      .add(new protobuf.Field("transactionHash", 1, "string"))
  );

  // ── Messaging messages ───────────────────────────────────────────────────
  const msgPkg = _root.define("messaging");

  msgPkg.add(
    new protobuf.Type("Peer")
      .add(new protobuf.Field("id", 1, "int64"))
      .add(new protobuf.Field("type", 2, "int32"))
      .add(new protobuf.Field("accessHash", 3, "int64"))
  );

  msgPkg.add(
    new protobuf.Type("TextContent")
      .add(new protobuf.Field("text", 1, "string"))
  );

  msgPkg.add(
    new protobuf.Type("MessageContent")
      .add(new protobuf.Field("textContent", 1, "messaging.TextContent"))
  );

  msgPkg.add(
    new protobuf.Type("SendMessageRequest")
      .add(new protobuf.Field("peer", 1, "messaging.Peer"))
      .add(new protobuf.Field("messageId", 2, "int64"))
      .add(new protobuf.Field("content", 3, "messaging.MessageContent"))
  );

  msgPkg.add(
    new protobuf.Type("Message")
      .add(new protobuf.Field("id", 1, "int64"))
      .add(new protobuf.Field("senderId", 2, "int64"))
      .add(new protobuf.Field("date", 3, "int64"))
      .add(new protobuf.Field("content", 4, "messaging.MessageContent"))
  );

  msgPkg.add(
    new protobuf.Type("Dialog")
      .add(new protobuf.Field("peer", 1, "messaging.Peer"))
      .add(new protobuf.Field("unreadCount", 2, "int32"))
      .add(new protobuf.Field("topMessageId", 3, "int64"))
  );

  msgPkg.add(
    new protobuf.Type("LoadDialogsRequest")
      .add(new protobuf.Field("minDate", 1, "int64"))
      .add(new protobuf.Field("limit", 2, "int32"))
  );

  msgPkg.add(
    new protobuf.Type("LoadHistoryRequest")
      .add(new protobuf.Field("peer", 1, "messaging.Peer"))
      .add(new protobuf.Field("startId", 2, "int64"))
      .add(new protobuf.Field("endId", 3, "int64"))
      .add(new protobuf.Field("limit", 4, "int32"))
  );

  return _root;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function encodeMessage(typePath: string, data: object): Uint8Array {
  const root = getRoot();
  const MsgType = root.lookupType(typePath);
  const err = MsgType.verify(data);
  if (err) throw new Error(`Protobuf verify failed for ${typePath}: ${err}`);
  return MsgType.encode(MsgType.create(data)).finish() as Uint8Array;
}

export function decodeMessage<T extends object>(
  typePath: string,
  bytes: Uint8Array
): T {
  const root = getRoot();
  const MsgType = root.lookupType(typePath);
  return MsgType.decode(bytes).toJSON() as T;
}
