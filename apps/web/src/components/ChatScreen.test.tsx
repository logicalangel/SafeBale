/**
 * Tests for the ChatScreen component.
 *
 * Strategy: mock `useAppContext` and `loadDialogs` so tests are pure
 * render / interaction tests with no network calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ChatScreen } from "./ChatScreen.js";
import type { AppContextValue } from "../context/AppContext.js";
import type { BaleDialog } from "@baleguard/bale-js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../context/AppContext.js");

// Keep the real module exports (PeerType, etc.) but override network calls.
vi.mock("@baleguard/bale-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@baleguard/bale-js")>();
  return {
    ...actual,
    loadDialogs: vi.fn().mockResolvedValue([]),
    loadHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
});

// ChatWindow is complex — stub it to keep ChatScreen tests focused.
vi.mock("./ChatWindow.js", () => ({
  ChatWindow: ({ peerId }: { peerId: string }) =>
    React.createElement("div", { "data-testid": "chat-window" }, peerId),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { useAppContext } from "../context/AppContext.js";

const mockUseAppContext = vi.mocked(useAppContext);

function makeDialogs(count: number): BaleDialog[] {
  return Array.from({ length: count }, (_, i) => ({
    peer: { id: `peer-${i + 1}`, type: 1, accessHash: "0" },
    unreadCount: i,
    topMessageId: String(i),
  }));
}

function makeContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    auth: { status: "authenticated", token: "tok", userId: "user-1" },
    setAuth: vi.fn(),
    transport: {} as AppContextValue["transport"],
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
    ...overrides,
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

describe("ChatScreen — empty dialogs", () => {
  it("shows the empty-state message when there are no dialogs", () => {
    render(<ChatScreen />);
    expect(screen.getByText("هنوز گفتگویی وجود ندارد")).toBeInTheDocument();
  });

  it("shows the 'select a chat' placeholder in the main area", () => {
    render(<ChatScreen />);
    expect(screen.getByText("یک گفتگو را انتخاب کنید")).toBeInTheDocument();
  });
});

describe("ChatScreen — with dialogs", () => {
  beforeEach(() => {
    mockUseAppContext.mockReturnValue(
      makeContext({ dialogs: makeDialogs(3) })
    );
  });

  it("renders a button for each dialog", () => {
    render(<ChatScreen />);
    expect(screen.getByText("peer-1")).toBeInTheDocument();
    expect(screen.getByText("peer-2")).toBeInTheDocument();
    expect(screen.getByText("peer-3")).toBeInTheDocument();
  });

  it("does not show the empty-state message", () => {
    render(<ChatScreen />);
    expect(screen.queryByText("هنوز گفتگویی وجود ندارد")).not.toBeInTheDocument();
  });

  it("clicking a dialog calls setActiveDialogPeerId with its peer id", () => {
    const setActiveDialogPeerId = vi.fn();
    mockUseAppContext.mockReturnValue(
      makeContext({ dialogs: makeDialogs(3), setActiveDialogPeerId })
    );
    render(<ChatScreen />);
    fireEvent.click(screen.getByText("peer-2").closest("button")!);
    expect(setActiveDialogPeerId).toHaveBeenCalledWith("peer-2");
  });

  it("highlights the active dialog", () => {
    mockUseAppContext.mockReturnValue(
      makeContext({ dialogs: makeDialogs(3), activeDialogPeerId: "peer-2" })
    );
    render(<ChatScreen />);
    // Use getAllByText because ChatWindow stub also renders the peer id
    const allPeer2 = screen.getAllByText("peer-2");
    const activeBtn = allPeer2.map((el) => el.closest("button")).find(Boolean)!;
    expect(activeBtn.className).toContain("bg-blue-600/15");
  });

  it("shows unread badge when unreadCount > 0", () => {
    // peer-2 has unreadCount = 1, peer-3 has unreadCount = 2
    render(<ChatScreen />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
