import { useState, useEffect } from "react";
import { useAuth } from "./contexts/AuthContext";

export function LoginScreen() {
  const { signInWithGoogle, signUp, signIn, session } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log("Session changed in LoginScreen:", session);
  }, [session]);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    console.log(`Attempting to ${mode}:`, { email, passwordLength: password.length });
    try {
      if (mode === "signup") {
        console.log("Calling signUp...");
        await signUp(email, password);
        console.log("SignUp successful");
      } else {
        console.log("Calling signIn...");
        await signIn(email, password);
        console.log("SignIn successful");
      }
    } catch (e) {
      console.error("Auth error:", e);
      const errorMessage = e instanceof Error ? e.message : "Something went wrong";
      
      // Check if it's an email confirmation message
      if (errorMessage.includes("check your email")) {
        setSuccess(errorMessage);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "48px 40px",
          borderRadius: "16px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          width: "100%",
          maxWidth: "420px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            width: "64px",
            height: "64px",
            background: mode === "signin" 
              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
              : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            borderRadius: "16px",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px"
          }}>
            {mode === "signin" ? "🎨" : "✨"}
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: "700", color: "#1a202c" }}>
            {mode === "signin" ? "Welcome back!" : "Join CollabBoard"}
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16, lineHeight: "1.5" }}>
            {mode === "signin" 
              ? "Sign in to continue your creative journey" 
              : "Create your account and start collaborating today"}
          </p>
        </div>

        {/* Google Sign-in Button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 16px",
            marginBottom: "24px",
            background: "white",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px"
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "#f9fafb";
              e.currentTarget.style.borderColor = "#9ca3af";
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = "white";
              e.currentTarget.style.borderColor = "#d1d5db";
            }
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285f4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34a853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fbbc04"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ea4335"/>
          </svg>
{loading ? "Signing in..." : mode === "signin" ? "Sign in with Google" : "Sign up with Google"}
        </button>

        <div style={{ 
          position: "relative", 
          textAlign: "center", 
          margin: "24px 0",
          color: "#9ca3af",
          fontSize: "14px"
        }}>
          <div style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: "1px",
            background: "#e5e7eb"
          }}></div>
          <span style={{
            background: "white",
            padding: "0 16px"
          }}>or</span>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmail}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: "16px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "14px",
              boxSizing: "border-box",
              transition: "border-color 0.2s ease"
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = "#667eea"}
            onBlur={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
          />
          <input
            type="password"
            placeholder={mode === "signin" ? "Password" : "Password (min. 6 characters)"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: mode === "signup" ? "8px" : "20px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "14px",
              boxSizing: "border-box",
              transition: "border-color 0.2s ease"
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = mode === "signin" ? "#667eea" : "#10b981"}
            onBlur={(e) => e.currentTarget.style.borderColor = "#d1d5db"}
          />
          
          {mode === "signup" && (
            <p style={{
              fontSize: "12px",
              color: "#6b7280",
              margin: "0 0 16px 0",
              lineHeight: "1.4"
            }}>
              Password must be at least 6 characters long
            </p>
          )}
          
          {error && (
            <div style={{
              marginBottom: "16px",
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#dc2626",
              fontSize: "14px"
            }}>
              {error}
            </div>
          )}
          
          {success && (
            <div style={{
              marginBottom: "16px",
              padding: "12px 16px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              color: "#166534",
              fontSize: "14px",
              lineHeight: "1.5"
            }}>
              {success}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: mode === "signin" 
                ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              boxShadow: mode === "signin" 
                ? "0 2px 4px rgba(102, 126, 234, 0.3)"
                : "0 2px 4px rgba(16, 185, 129, 0.3)"
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = mode === "signin"
                  ? "0 4px 8px rgba(102, 126, 234, 0.4)"
                  : "0 4px 8px rgba(16, 185, 129, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = mode === "signin"
                  ? "0 2px 4px rgba(102, 126, 234, 0.3)"
                  : "0 2px 4px rgba(16, 185, 129, 0.3)";
              }
            }}
          >
            {loading ? "..." : mode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button
            type="button"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            style={{
              background: "transparent",
              border: "none",
              color: "#667eea",
              fontSize: "14px",
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            {mode === "signin" 
              ? "Don't have an account? Create one" 
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}