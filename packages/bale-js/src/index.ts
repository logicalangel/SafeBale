export { BaleTransport, sendRequest } from "./transport.js";
export { startPhoneAuth, validateCode } from "./auth.js";
export {
  sendMessage,
  loadDialogs,
  loadHistory,
} from "./messaging.js";
export type { BalePeer, BaleMessage, BaleDialog } from "./messaging.js";
export {
  BALE_APP_ID,
  BALE_API_KEY,
  BALE_WS_URL,
  Services,
  PeerType,
} from "./constants.js";
export type { ServiceId, PeerTypeValue } from "./constants.js";
export {
  encodeGrpcFrame,
  decodeGrpcFrame,
  encodeMessage,
  decodeMessage,
} from "./proto.js";
