/**
 * Global app state and React context.
 * Manages: auth state, active conversation, transport + crypto handles.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { BaleTransport } from "@baleguard/bale-js";
import { KeyStore, Codex } from "@baleguard/e2e-crypto";
import type { BaleDialog } from "@baleguard/bale-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState =
  | { status: "unauthenticated" }
  | { status: "awaiting-code"; transactionHash: string; phone: string }
  | { status: "authenticated"; token: string; userId: string };

export interface AppContextValue {
  auth: AuthState;
  setAuth: (s: AuthState) => void;
  transport: BaleTransport | null;
  setTransport: (t: BaleTransport | null) => void;
  dialogs: BaleDialog[];
  setDialogs: (d: BaleDialog[]) => void;
  activeDialogPeerId: string | null;
  setActiveDialogPeerId: (id: string | null) => void;
  codex: Codex;
  ownPublicKeySpki: Uint8Array | null;
  setOwnPublicKeySpki: (k: Uint8Array | null) => void;
  /** Lazily initialise the own key pair and set ownPublicKeySpki. */
  initKeys: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppContext = createContext<AppContextValue | null>(null);

const sharedCodex = new Codex();

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "unauthenticated" });
  const [transport, setTransport] = useState<BaleTransport | null>(null);
  const [dialogs, setDialogs] = useState<BaleDialog[]>([]);
  const [activeDialogPeerId, setActiveDialogPeerId] = useState<string | null>(
    null
  );
  const [ownPublicKeySpki, setOwnPublicKeySpki] = useState<Uint8Array | null>(
    null
  );

  const initKeys = useCallback(async () => {
    const pair = await KeyStore.getOrCreateOwnKeyPair();
    const spki = await KeyStore.exportPublicKey(pair.publicKey);
    setOwnPublicKeySpki(spki);
  }, []);

  const value: AppContextValue = {
    auth,
    setAuth,
    transport,
    setTransport,
    dialogs,
    setDialogs,
    activeDialogPeerId,
    setActiveDialogPeerId,
    codex: sharedCodex,
    ownPublicKeySpki,
    setOwnPublicKeySpki,
    initKeys,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}
