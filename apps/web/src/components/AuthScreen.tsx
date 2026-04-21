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

  const inputCls =
    "w-full rounded-xl border border-[#2d3748] bg-[#0d1117] px-4 py-3 text-[#e2e8f0] placeholder-[#4a5568] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50";
  const btnPrimary =
    "w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
  const btnSecondary =
    "w-full rounded-xl border border-[#2d3748] bg-transparent px-4 py-3 font-medium text-[#8b98a9] transition hover:border-[#4a5568] hover:text-[#e2e8f0] disabled:opacity-50";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0d1117] px-4">
      <div className="w-full max-w-sm">
        {/* Logo area */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600/10 ring-1 ring-blue-500/30">
            <svg className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">BaleGuard</h1>
          <p className="mt-1 text-sm text-[#8b98a9]">پیام‌رسان رمزنگاری‌شده سرتاسر</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#2d3748] bg-[#161b22] p-6 shadow-xl shadow-black/40">
          {auth.status === "unauthenticated" && (
            <form onSubmit={handleSendCode} className="flex flex-col gap-4">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-[#8b98a9]">
                  شماره موبایل
                </label>
                <input
                  id="phone"
                  type="tel"
                  dir="ltr"
                  placeholder="+989123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                  className={inputCls}
                />
              </div>
              <button type="submit" disabled={loading} className={btnPrimary}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    در حال ارسال…
                  </span>
                ) : "ارسال کد"}
              </button>
            </form>
          )}

          {auth.status === "awaiting-code" && (
            <form onSubmit={handleValidateCode} className="flex flex-col gap-4">
              <p className="text-sm text-[#8b98a9]">
                کد ارسال‌شده به{" "}
                <span className="font-mono text-[#e2e8f0]" dir="ltr">{auth.phone}</span>{" "}
                را وارد کنید:
              </p>
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-[#8b98a9]">
                  کد تأیید
                </label>
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
                  className={inputCls}
                />
              </div>
              <button type="submit" disabled={loading} className={btnPrimary}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    در حال بررسی…
                  </span>
                ) : "ورود"}
              </button>
              <button
                type="button"
                onClick={() => setAuth({ status: "unauthenticated" })}
                disabled={loading}
                className={btnSecondary}
              >
                بازگشت
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[#4a5568]">
          رمزنگاری DRSAP · پنهان‌نگاری Nahoft
        </p>
      </div>
    </div>
  );
}
