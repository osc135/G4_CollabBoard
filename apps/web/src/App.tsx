import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { LoginScreen } from "./LoginScreen";
import { Dashboard } from "./Dashboard";
import { BoardRoom } from "./BoardRoom";

function AuthGatedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e293b" }}>
        <span style={{ color: "white" }}>Loading…</span>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/board/:roomId" element={<BoardRoom />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/view/:roomId" element={<BoardRoom readOnly />} />
        <Route path="*" element={<AuthGatedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
