import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider, loginWithGoogle as serviceLoginWithGoogle } from "../services/firebase.js";
import { signOut } from "firebase/auth";
import { store } from "../lib/subay/store";

const ADMIN_EMAIL = "langgamen.carlsyker@gmail.com";

function normalizeRole(role) {
  if (role === "admin" || role === "authority" || role === "viewer") {
    return role;
  }
  return "viewer";
}

function resolveRoleForUser(authUser, existingRole) {
  if (!authUser?.email) return "viewer";

  const normalizedEmail = authUser.email.trim().toLowerCase();
  if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) return "admin";
  if (existingRole) return normalizeRole(existingRole);
  return "viewer";
}

let currentAuthValue = {
  user: null,
  isAdmin: false,
  role: "viewer",
  loading: true,
  adminMode: false,
  setAdminMode: () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
};

const authListeners = new Set();

function emitAuthValue() {
  authListeners.forEach((listener) => listener());
}

function updateAuthValue(partial) {
  currentAuthValue = { ...currentAuthValue, ...partial };
  emitAuthValue();
}

const AuthContext = createContext(currentAuthValue);

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
  const [adminMode, setAdminModeState] = useState(false);

  useEffect(() => {
    updateAuthValue({ user, isAdmin, role, loading, adminMode });
  }, [user, isAdmin, role, loading, adminMode]);

  useEffect(() => {
    if (!user?.email) return undefined;

    const syncRoleFromStore = () => {
      const existingUser = store.getState().users.find((entry) => entry.email.toLowerCase() === user.email.toLowerCase());
      const nextRole = resolveRoleForUser(user, existingUser?.role);
      setRole(nextRole);
      setIsAdmin(nextRole === "admin");
    };

    const unsubscribe = store.subscribe(syncRoleFromStore);
    syncRoleFromStore();
    return unsubscribe;
  }, [user?.email]);

  useEffect(() => {
    let unsub = () => {};
    // eslint-disable-next-line no-undef
    const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
    if (isDev) {
      try {
        const raw = localStorage.getItem("subay-state-v1");
        if (raw) {
          const s = JSON.parse(raw);
          if (s.currentUserId) {
            const fallbackUser = {
              uid: s.currentUserId,
              email: `${s.currentUserId}@dev.local`,
              displayName: "Dev User",
              photoURL: null,
              name: "Dev User",
            };
            setUser(fallbackUser);
            store.upsertUserFromAuth(fallbackUser);
            const nextRole = resolveRoleForUser(fallbackUser, undefined);
            setIsAdmin(nextRole === "admin");
            setRole(nextRole);
            setLoading(false);
            unsub = onAuthStateChanged(auth, () => {});
            return () => unsub();
          }
        }
      } catch (e) {
        // ignore JSON errors
      }
    }

    unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        setRole("viewer");
        setLoading(false);
        return;
      }

      const mappedUser = mapUser(firebaseUser);
      setUser(mappedUser);
      store.upsertUserFromAuth(mappedUser);

      try {
        const tokenResult = await firebaseUser.getIdTokenResult(true);
        const claimRole =
          tokenResult.claims?.role ??
          (tokenResult.claims?.authority === true ? "authority" : undefined) ??
          (tokenResult.claims?.authorities ? "authority" : undefined) ??
          (tokenResult.claims?.roleName ?? undefined);

        const storedUser = store.getState().users.find((entry) => entry.email.toLowerCase() === mappedUser.email.toLowerCase());
        const nextRole = resolveRoleForUser(mappedUser, claimRole ?? storedUser?.role);
        setIsAdmin(nextRole === "admin");
        setRole(nextRole);
      } catch (error) {
        console.error("Failed to fetch custom claims", error);
        const storedUser = store.getState().users.find((entry) => entry.email.toLowerCase() === mappedUser.email.toLowerCase());
        const nextRole = resolveRoleForUser(mappedUser, storedUser?.role);
        setIsAdmin(nextRole === "admin");
        setRole(nextRole);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const setAdminMode = (enabled) => {
    setAdminModeState(Boolean(enabled));
    if (typeof window !== "undefined") {
      window.localStorage.setItem("subay_admin_mode", String(Boolean(enabled)));
    }
    updateAuthValue({ adminMode: Boolean(enabled) });
  };

  const loginWithGoogle = async () => {
    const resultUser = await serviceLoginWithGoogle();
    const loggedInUser = mapUser(resultUser);

    store.upsertUserFromAuth(loggedInUser);

    let claimRole = undefined;
    try {
      const tokenResult = await resultUser.getIdTokenResult(true);
      claimRole =
        tokenResult.claims?.role ??
        (tokenResult.claims?.authority === true ? "authority" : undefined) ??
        (tokenResult.claims?.authorities ? "authority" : undefined) ??
        (tokenResult.claims?.roleName ?? undefined);
    } catch (error) {
      console.error("Failed to refresh claims after login", error);
    }

    const storedUser = store.getState().users.find((entry) => entry.email.toLowerCase() === loggedInUser.email.toLowerCase());
    const nextRole = resolveRoleForUser(loggedInUser, claimRole ?? storedUser?.role);

    setUser(loggedInUser);
    setIsAdmin(nextRole === "admin");
    setRole(nextRole);
    return resultUser;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdmin(false);
    setRole("viewer");
    updateAuthValue({ user: null, isAdmin: false, role: "viewer", loading: false, adminMode });
  };

  const value = useMemo(
    () => ({ user, isAdmin, role, loading, adminMode, setAdminMode, loginWithGoogle, logout }),
    [user, isAdmin, role, loading, adminMode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? currentAuthValue;
}
