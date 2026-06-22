import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase.js";
import { signInWithPopup, signOut } from "firebase/auth";

const AuthContext = createContext(null);

function mapUser(user) {
  if (!user) return null;

  const { uid, email, displayName, photoURL } = user;
  const name = displayName || email || "";
  return { uid, email, displayName, photoURL, name };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        setRole("viewer");
        setLoading(false);
        return;
      }

      const mappedUser = mapUser(firebaseUser);
      setUser(mappedUser);

      try {
        const tokenResult = await firebaseUser.getIdTokenResult(true);
        setIsAdmin(Boolean(tokenResult.claims?.admin === true));

        const claimRole =
          tokenResult.claims?.role ??
          (tokenResult.claims?.authority === true ? "authority" : undefined) ??
          (tokenResult.claims?.authorities ? "authority" : undefined) ??
          (tokenResult.claims?.roleName ?? undefined);

        setRole(claimRole ?? (tokenResult.claims?.admin ? "admin" : "viewer"));
      } catch (error) {
        console.error("Failed to fetch custom claims", error);
        setIsAdmin(false);
        setRole("viewer");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const loggedInUser = mapUser(result.user);

    let admin = false;
    let claimRole = "viewer";
    try {
      const tokenResult = await result.user.getIdTokenResult(true);
      admin = Boolean(tokenResult.claims?.admin === true);
      claimRole = tokenResult.claims?.role ?? (admin ? "admin" : "viewer");
    } catch (error) {
      console.error("Failed to refresh claims after login", error);
    }

    setUser(loggedInUser);
    setIsAdmin(admin);
    setRole(claimRole);
    return result.user;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setRole("viewer");
  };

  const value = useMemo(
    () => ({ user, isAdmin, role, loading, loginWithGoogle, logout }),
    [user, isAdmin, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
