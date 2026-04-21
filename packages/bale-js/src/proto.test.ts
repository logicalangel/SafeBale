/**
 * Tests for the gRPC framing helpers and protobuf encode/decode in proto.ts.
 */

import { describe, it, expect } from "vitest";
import {
  encodeGrpcFrame,
  decodeGrpcFrame,
  encodeMessage,
  decodeMessage,
} from "./proto.js";

// ---------------------------------------------------------------------------
// encodeGrpcFrame
// ---------------------------------------------------------------------------

describe("encodeGrpcFrame", () => {
  it("produces a frame exactly 5 bytes longer than the payload", () => {
    const payload = new Uint8Array([1, 2, 3]);
    expect(encodeGrpcFrame(payload).length).toBe(8);
  });

  it("sets the compression flag byte to 0x00", () => {
    const frame = encodeGrpcFrame(new Uint8Array([255]));
    expect(frame[0]).toBe(0x00);
  });

  it("encodes payload length as big-endian uint32 in bytes 1–4", () => {
    const payload = new Uint8Array(300); // length 300 = 0x0000012C
    const frame = encodeGrpcFrame(payload);
    expect(frame[1]).toBe(0x00);
    expect(frame[2]).toBe(0x00);
    expect(frame[3]).toBe(0x01);
    expect(frame[4]).toBe(0x2c);
  });

  it("copies payload bytes starting at offset 5", () => {
    const payload = new Uint8Array([10, 20, 30]);
    const frame = encodeGrpcFrame(payload);
    expect(frame.slice(5)).toEqual(payload);
  });

  it("handles an empty payload", () => {
    const frame = encodeGrpcFrame(new Uint8Array(0));
    expect(frame.length).toBe(5);
    expect(frame[0]).toBe(0x00);
    expect(frame.slice(1, 5)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });
});

// ---------------------------------------------------------------------------
// decodeGrpcFrame
// ---------------------------------------------------------------------------

describe("decodeGrpcFrame", () => {
  it("roundtrips with encodeGrpcFrame", () => {
    const payload = new Uint8Array([10, 20, 30, 40, 50]);
    expect(decodeGrpcFrame(encodeGrpcFrame(payload))).toEqual(payload);
  });

  it("roundtrips an empty payload", () => {
    expect(decodeGrpcFrame(encodeGrpcFrame(new Uint8Array(0)))).toEqual(
      new Uint8Array(0)
    );
  });

  it("throws when frame is shorter than 5 bytes", () => {
    expect(() => decodeGrpcFrame(new Uint8Array([0, 0, 0]))).toThrow(
      "gRPC frame too short"
    );
  });

  it("throws when compression flag byte is not 0x00", () => {
    const frame = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x01, 0xff]);
    expect(() => decodeGrpcFrame(frame)).toThrow(
      "Compressed gRPC frames not supported"
    );
  });

  it("throws when the declared length exceeds available bytes", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const frame = encodeGrpcFrame(payload).slice(0, 6); // truncate to 6 bytes
    expect(() => decodeGrpcFrame(frame)).toThrow("gRPC frame truncated");
  });
});

// ---------------------------------------------------------------------------
// encodeMessage / decodeMessage
// ---------------------------------------------------------------------------

describe("encodeMessage / decodeMessage", () => {
  it("roundtrips auth.StartPhoneAuthRequest", () => {
    const data = {
      phoneNumber: "+98901234567",
      appId: 4,
      apiKey: "api-key",
      deviceHash: "device-hash",
      deviceTitle: "Test Device",
      sendCodeType: 1,
    };
    const bytes = encodeMessage("auth.StartPhoneAuthRequest", data);
    const decoded = decodeMessage<typeof data>("auth.StartPhoneAuthRequest", bytes);
    expect(decoded.phoneNumber).toBe(data.phoneNumber);
    expect(decoded.appId).toBe(data.appId);
    expect(decoded.deviceTitle).toBe(data.deviceTitle);
  });

  it("roundtrips auth.ValidateCodeRequest", () => {
    const data = { transactionHash: "tx-abc-123", code: "54321" };
    const bytes = encodeMessage("auth.ValidateCodeRequest", data);
    const decoded = decodeMessage<typeof data>("auth.ValidateCodeRequest", bytes);
    expect(decoded.transactionHash).toBe(data.transactionHash);
    expect(decoded.code).toBe(data.code);
  });

  it("roundtrips auth.StartPhoneAuthResponse", () => {
    const data = { transactionHash: "tx-xyz" };
    const bytes = encodeMessage("auth.StartPhoneAuthResponse", data);
    const decoded = decodeMessage<typeof data>("auth.StartPhoneAuthResponse", bytes);
    expect(decoded.transactionHash).toBe(data.transactionHash);
  });

  it("roundtrips messaging.LoadDialogsRequest", () => {
    const data = { minDate: 0, limit: 50 };
    const bytes = encodeMessage("messaging.LoadDialogsRequest", data);
    const decoded = decodeMessage<typeof data>("messaging.LoadDialogsRequest", bytes);
    expect(decoded.limit).toBe(data.limit);
  });

  it("roundtrips messaging.TextContent", () => {
    const data = { text: "Hello, World!" };
    const bytes = encodeMessage("messaging.TextContent", data);
    const decoded = decodeMessage<typeof data>("messaging.TextContent", bytes);
    expect(decoded.text).toBe(data.text);
  });

  it("encodeMessage throws for an unknown type path", () => {
    expect(() => encodeMessage("auth.NoSuchType", {})).toThrow();
  });

  it("encodeMessage produces a non-empty Uint8Array for valid data", () => {
    const bytes = encodeMessage("messaging.TextContent", { text: "hi" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
