/**
 * Bale app credentials (public — hardcoded in the official web client).
 * Source: aiobale client.py
 */
export const BALE_APP_ID = 4;
export const BALE_API_KEY =
  "C28D46DC4C3A7A26564BFCC48B929086A95C93C98E789A19847BEE8627DE4E7D";

/** gRPC-WebSocket endpoint for Bale web client */
export const BALE_WS_URL = "wss://api.bale.ai/v1/ws";

/** Protobuf service IDs (mirrors aiobale Services enum) */
export const Services = {
  AUTH: 1,
  MESSAGING: 2,
} as const;

export type ServiceId = (typeof Services)[keyof typeof Services];

/** Peer types for Bale chats */
export const PeerType = {
  PRIVATE: 1,
  GROUP: 2,
  CHANNEL: 3,
} as const;

export type PeerTypeValue = (typeof PeerType)[keyof typeof PeerType];
