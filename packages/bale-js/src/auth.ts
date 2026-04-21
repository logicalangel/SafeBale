/**
 * Bale auth flow — mirrors aiobale auth methods.
 *
 * Step 1: startPhoneAuth(phoneNumber) → transactionHash
 * Step 2: validateCode(transactionHash, smsCode) → { token, userId }
 */

import { BaleTransport, sendRequest } from "./transport.js";
import { decodeMessage } from "./proto.js";
import {
  BALE_APP_ID,
  BALE_API_KEY,
  Services,
} from "./constants.js";

interface StartPhoneAuthResponse {
  transactionHash: string;
}

interface AuthResponse {
  token: string;
  userId: string; // int64 serialised as string in protobufjs JSON
}

/**
 * Begin phone-number authentication.
 * Returns the transaction hash needed by `validateCode()`.
 */
export async function startPhoneAuth(
  transport: BaleTransport,
  phoneNumber: string
): Promise<string> {
  const responseBytes = await sendRequest(
    transport,
    Services.AUTH,
    "StartPhoneAuth",
    "auth.StartPhoneAuthRequest",
    {
      phoneNumber,
      appId: BALE_APP_ID,
      apiKey: BALE_API_KEY,
      deviceHash: crypto.randomUUID().replace(/-/g, ""),
      deviceTitle: "BaleGuard Web",
      sendCodeType: 0,
    }
  );

  const response = decodeMessage<StartPhoneAuthResponse>(
    "auth.StartPhoneAuthResponse",
    responseBytes
  );
  return response.transactionHash;
}

/**
 * Validate the SMS code. Returns the auth token and numeric userId.
 */
export async function validateCode(
  transport: BaleTransport,
  transactionHash: string,
  code: string
): Promise<{ token: string; userId: string }> {
  const responseBytes = await sendRequest(
    transport,
    Services.AUTH,
    "ValidateCode",
    "auth.ValidateCodeRequest",
    { transactionHash, code }
  );

  const response = decodeMessage<AuthResponse>(
    "auth.AuthResponse",
    responseBytes
  );
  return { token: response.token, userId: response.userId };
}
