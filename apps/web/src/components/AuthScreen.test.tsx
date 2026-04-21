/**
 * Tests for the AuthScreen component.
 *
 * Strategy: mock `useAppContext` to control auth state, and mock the
 * bale-js transport layer so no real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { AuthScreen } from "./AuthScreen.js";
import type { AppContextValue, AuthState } from "../context/AppContext.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../context/AppContext.js");

vi.mock("@baleguard/bale-js", () => ({
  BaleTransport: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  })),
  startPhoneAuth: vi.fn().mockResolvedValue("tx-hash-123"),
  validateCode: vi.fn().mockResolvedValue({ token: "tok-abc", userId: "user-1" }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { useAppContext } from "../context/AppContext.js";

const mockUseAppContext = vi.mocked(useAppContext);

function makeContext(authOverride?: AuthState): AppContextValue {
  return {
    auth: authOverride ?? { status: "unauthenticated" },
    setAuth: vi.fn(),
    transport: null,
    setTransport: vi.fn(),
    dialogs: [],
    setDialogs: vi.fn(),
    activeDialogPeerId: null,
    setActiveDialogPeerId: vi.fn(),
    codex: {
      encodeKey: vi.fn(),
      encodeEncryptedMessage: vi.fn(),
      decode: vi.fn(),
    } as unknown as AppContextValue["codex"],
    ownPublicKeySpki: null,
    setOwnPublicKeySpki: vi.fn(),
    initKeys: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  mockUseAppContext.mockReturnValue(makeContext());
  vi.clearAllMocks();
  mockUseAppContext.mockReturnValue(makeContext());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthScreen — unauthenticated state", () => {
  it("renders the phone number label", () => {
    render(<AuthScreen />);
    expect(screen.getByText("شماره موبایل")).toBeInTheDocument();
  });

  it("renders the phone number input", () => {
    render(<AuthScreen />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders the send-code submit button", () => {
    render(<AuthScreen />);
    expect(screen.getByRole("button", { name: "ارسال کد" })).toBeInTheDocument();
  });

  it("does not show the code input", () => {
    render(<AuthScreen />);
    expect(screen.queryByText("کد تأیید")).not.toBeInTheDocument();
  });

  it("calls setAuth with awaiting-code on successful phone submission", async () => {
    const setAuth = vi.fn();
    mockUseAppContext.mockReturnValue(makeContext());
    const ctx = makeContext();
    ctx.setAuth = setAuth;
    mockUseAppContext.mockReturnValue(ctx);

    render(<AuthScreen />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "+98901234567" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "ارسال کد" }).closest("form")!);

    await waitFor(() => {
      expect(setAuth).toHaveBeenCalledWith(
        expect.objectContaining({ status: "awaiting-code" })
      );
    });
  });
});

describe("AuthScreen — awaiting-code state", () => {
  beforeEach(() => {
    mockUseAppContext.mockReturnValue(
      makeContext({
        status: "awaiting-code",
        transactionHash: "tx-hash",
        phone: "+98901234567",
      })
    );
  });

  it("renders the verification code label", () => {
    render(<AuthScreen />);
    expect(screen.getByText("کد تأیید")).toBeInTheDocument();
  });

  it("renders the sign-in button", () => {
    render(<AuthScreen />);
    expect(screen.getByRole("button", { name: "ورود" })).toBeInTheDocument();
  });

  it("renders the back button", () => {
    render(<AuthScreen />);
    expect(screen.getByRole("button", { name: "بازگشت" })).toBeInTheDocument();
  });

  it("back button calls setAuth with unauthenticated", () => {
    const setAuth = vi.fn();
    const ctx = makeContext({
      status: "awaiting-code",
      transactionHash: "tx-hash",
      phone: "+98901234567",
    });
    ctx.setAuth = setAuth;
    mockUseAppContext.mockReturnValue(ctx);

    render(<AuthScreen />);
    fireEvent.click(screen.getByRole("button", { name: "بازگشت" }));
    expect(setAuth).toHaveBeenCalledWith({ status: "unauthenticated" });
  });

  it("does not show phone input in awaiting-code state", () => {
    render(<AuthScreen />);
    expect(screen.queryByText("شماره موبایل")).not.toBeInTheDocument();
  });
});
