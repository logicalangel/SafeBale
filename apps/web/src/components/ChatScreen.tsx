/**
 * Chat screen — dialog list + active conversation.
 *
 * Handles:
 *   • Loading dialogs on mount
 *   • Rendering the conversation list (sidebar)
 *   • Rendering the active conversation (ChatWindow)
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
    <div className="chat-screen">
      <aside className="sidebar">
        <h2>گفتگوها</h2>
        {dialogs.length === 0 && (
          <p className="empty">هنوز گفتگویی وجود ندارد</p>
        )}
        <ul className="dialog-list">
          {dialogs.map((d) => (
            <li
              key={d.peer.id}
              className={
                activeDialogPeerId === d.peer.id ? "dialog-item active" : "dialog-item"
              }
              onClick={() => setActiveDialogPeerId(d.peer.id)}
            >
              <span className="peer-id">{d.peer.id}</span>
              {d.unreadCount > 0 && (
                <span className="unread-badge">{d.unreadCount}</span>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-area">
        {activeDialogPeerId ? (
          <ChatWindow peerId={activeDialogPeerId} />
        ) : (
          <div className="no-chat">یک گفتگو را انتخاب کنید</div>
        )}
      </main>
    </div>
  );
}
