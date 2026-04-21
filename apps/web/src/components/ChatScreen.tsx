/**
 * Chat screen — dialog list + active conversation.
 */

import { useEffect } from "react";
import { loadDialogs } from "@baleguard/bale-js";
import { useAppContext } from "../context/AppContext.js";
import { ChatWindow } from "./ChatWindow.js";

export function ChatScreen() {
  const {
    transport,
    dialogs,
    setDialogs,
    activeDialogPeerId,
    setActiveDialogPeerId,
  } = useAppContext();

  useEffect(() => {
    if (!transport) return;
    loadDialogs(transport).then(setDialogs).catch(console.error);
  }, [transport, setDialogs]);

  return (
    <div className="flex h-dvh bg-[#0d1117]">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-l border-[#2d3748] bg-[#161b22]">
        <div className="flex items-center gap-2 border-b border-[#2d3748] px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10">
            <svg className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-[#e2e8f0]">گفتگوها</span>
        </div>

        <ul className="flex-1 overflow-y-auto py-2">
          {dialogs.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[#4a5568]">
              هنوز گفتگویی وجود ندارد
            </li>
          )}
          {dialogs.map((d) => {
            const isActive = activeDialogPeerId === d.peer.id;
            return (
              <li key={d.peer.id}>
                <button
                  className={`flex w-full items-center gap-3 px-4 py-3 text-right transition ${
                    isActive
                      ? "bg-blue-600/15 text-white"
                      : "text-[#c9d1d9] hover:bg-[#1e2530]"
                  }`}
                  onClick={() => setActiveDialogPeerId(d.peer.id)}
                >
                  {/* Avatar */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${isActive ? "bg-blue-600" : "bg-[#2d3748]"}`}>
                    {d.peer.id.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate text-sm">{d.peer.id}</span>
                  {d.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">
                      {d.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeDialogPeerId ? (
          <ChatWindow peerId={activeDialogPeerId} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[#4a5568]">
            <svg className="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">یک گفتگو را انتخاب کنید</p>
          </div>
        )}
      </main>
    </div>
  );
}
