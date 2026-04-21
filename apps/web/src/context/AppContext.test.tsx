/**
 * Tests for AppProvider and useAppContext hook.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import React from "react";
import { AppProvider, useAppContext } from "./AppContext.js";

// Mock workspace packages that AppContext depends on
vi.mock("@baleguard/e2e-crypto", () => ({
  KeyStore: {
    getOrCreateOwnKeyPair: vi.fn().mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    }),
    exportPublicKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  },
  Codex: vi.fn().mockImplementation(() => ({
    encodeKey: vi.fn().mockReturnValue("encoded-key"),
    encodeEncryptedMessage: vi.fn().mockReturnValue("encoded-msg"),
    decode: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock("@baleguard/bale-js", () => ({
  BaleTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  })),
}));

describe("AppProvider", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <AppProvider>
        <span>child element</span>
      </AppProvider>
    );
    expect(getByText("child element")).toBeTruthy();
  });

  it("provides unauthenticated auth state by default", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    expect(result.current.auth.status).toBe("unauthenticated");
  });

  it("provides an empty dialogs array by default", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    expect(result.current.dialogs).toEqual([]);
  });

  it("provides a null transport by default", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    expect(result.current.transport).toBeNull();
  });

  it("provides a null activeDialogPeerId by default", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    expect(result.current.activeDialogPeerId).toBeNull();
  });

  it("setAuth updates auth state", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    act(() => {
      result.current.setAuth({
        status: "awaiting-code",
        transactionHash: "tx123",
        phone: "+98901234567",
      });
    });
    expect(result.current.auth.status).toBe("awaiting-code");
  });

  it("setActiveDialogPeerId updates activeDialogPeerId", () => {
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    act(() => {
      result.current.setActiveDialogPeerId("peer-42");
    });
    expect(result.current.activeDialogPeerId).toBe("peer-42");
  });

  it("initKeys calls KeyStore and updates ownPublicKeySpki", async () => {
    const { KeyStore } = await import("@baleguard/e2e-crypto");
    const { result } = renderHook(() => useAppContext(), {
      wrapper: AppProvider,
    });
    await act(async () => {
      await result.current.initKeys();
    });
    expect(KeyStore.getOrCreateOwnKeyPair).toHaveBeenCalled();
    expect(KeyStore.exportPublicKey).toHaveBeenCalled();
    expect(result.current.ownPublicKeySpki).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("useAppContext outside provider", () => {
  it("throws a descriptive error", () => {
    // Suppress React's error output in test console
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useAppContext())).toThrow(
      "useAppContext must be used inside <AppProvider>"
    );
    spy.mockRestore();
  });
});
