"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { AppUser } from "@/lib/mockUsers";
import { MOCK_USERS } from "@/lib/mockUsers";

type AuthContextType = {
  user: AppUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read from localStorage on mount
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("salonPlatformUser");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AppUser;
          setUser(parsed);
        } catch (e) {
          console.error("Failed to parse stored user", e);
          window.localStorage.removeItem("salonPlatformUser");
        }
      }
      setLoading(false);
    }
  }, []);

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const foundUser = MOCK_USERS.find(
      (u) => u.email === email && u.password === password
    );

    if (!foundUser) {
      return { success: false, error: "פרטי ההתחברות אינם נכונים" };
    }

    // Remove password before storing
    const { password: _, ...userWithoutPassword } = foundUser;

    setUser(foundUser);
    if (typeof window !== "undefined") {
      // Store user without password
      window.localStorage.setItem("salonPlatformUser", JSON.stringify(userWithoutPassword));
    }

    return { success: true };
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("salonPlatformUser");
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

