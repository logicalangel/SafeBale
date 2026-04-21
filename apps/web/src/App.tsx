import { AppProvider, useAppContext } from "./context/AppContext.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { ChatScreen } from "./components/ChatScreen.js";
import "./styles.css";

function AppInner() {
  const { auth } = useAppContext();
  return auth.status === "authenticated" ? <ChatScreen /> : <AuthScreen />;
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
