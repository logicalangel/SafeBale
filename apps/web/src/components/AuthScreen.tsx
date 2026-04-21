/**
 * Auth flow component.
 *
 * Screen 1 — Phone number entry
 * Screen 2 — SMS code entry
 *
 * On success: connects WebSocket, initialises crypto keys, switches to chat.
 */

import { useState } from "react";
import { BaleTransport, startPhoneAuth, validateCode } from "@baleguard/bale-js";
import { useAppContext } from "../context/AppContext.js";

export function AuthScreen() {
  const { auth, setAuth, setTransport, initKeys } = useAppContext();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Step 1: send phone number ────────────────────────────────────────────
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const transport = new BaleTransport();
      await transport.connect();

      const transactionHash = await startPhoneAuth(transport, phone.trim());
      setTransport(transport);
      setAuth({ status: "awaiting-code", transactionHash, phone: phone.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: validate SMS code ────────────────────────────────────────────
  async function handleValidateCode(e: React.FormEvent) {
    e.preventDefault();
    if (auth.status !== "awaiting-code" || !code.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const transport = new BaleTransport();
      await transport.connect();

      const { token, userId } = await validateCode(
        transport,
        auth.transactionHash,
        code.trim()
      );

      // Reconnect with auth token
      transport.disconnect();
      const authedTransport = new BaleTransport();
      await authedTransport.connect(token);

      setTransport(authedTransport);
      setAuth({ status: "authenticated", token, userId });
      await initKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      <h1>BaleGuard</h1>
      <p className="subtitle">پیام‌رسان رمزنگاری‌شده سرتاسر</p>

      {auth.status === "unauthenticated" && (
        <form onSubmit={handleSendCode}>
          <label htmlFor="phone">شماره موبایل</label>
          <input
            id="phone"
            type="tel"
            dir="ltr"
            placeholder="+989123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "در حال ارسال…" : "ارسال کد"}
          </button>
        </form>
      )}

      {auth.status === "awaiting-code" && (
        <form onSubmit={handleValidateCode}>
          <p>کد ارسال‌شده به {auth.phone} را وارد کنید:</p>
          <label htmlFor="code">کد تأیید</label>
          <input
            id="code"
            type="text"
            dir="ltr"
            inputMode="numeric"
            placeholder="12345"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "در حال بررسی…" : "ورود"}
          </button>
          <button
            type="button"
            onClick={() => setAuth({ status: "unauthenticated" })}
            disabled={loading}
          >
            بازگشت
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
