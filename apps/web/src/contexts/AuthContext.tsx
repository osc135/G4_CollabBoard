import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  displayName: string;
  userId: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ 
      email, 
      password
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const user = session?.user ?? null;
  
  // Extract first name from full name or email
  const getFirstName = (fullName?: string, email?: string): string => {
    if (fullName) {
      return fullName.split(' ')[0];
    }
    if (email) {
      const emailPrefix = email.split("@")[0];
      // Capitalize first letter
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase();
    }
    return "Anonymous";
  };
  
  const displayName = getFirstName(
    user?.user_metadata?.full_name as string | undefined,
    user?.email
  );
  const userId = user?.id ?? "";

  const value: AuthContextValue = {
    session,
    user,
    loading,
    signInWithGoogle,
    signUp,
    signIn,
    signOut,
    displayName,
    userId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
