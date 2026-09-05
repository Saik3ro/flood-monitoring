import { useSyncExternalStore } from "react";
import type { Camera, User, Role } from "./types";
import { statusFromLevel } from "./types";

const initialCameras: Camera[] = [];

const ADMIN_EMAILS = [
  "langgamen.carlsyker@gmail.com",
  "barillo.juliusvincent@gmail.com",
];

function normalizeRole(role?: string | null): Role {
  if (role === "admin" || role === "authority" || role === "viewer") {
    return role;
  }
  return "viewer";
}

function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === normalizedEmail);
}

function createAdminUser(): User {
  return {
    id: "u_admin",
    name: "Admin Account",
    email: ADMIN_EMAILS[0],
    role: "admin",
    addedAt: new Date().toISOString(),
  };
}

const initialUsers: User[] = [];

interface State {
  cameras: Camera[];
  users: User[];
  currentUserId: string | null;
}

const LS_KEY = "floodsight-state-v1";

function load(): State {
  if (typeof window === "undefined") {
    return { cameras: [], users: [], currentUserId: null };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      return {
        cameras: [],
        users: Array.isArray(parsed.users) ? parsed.users : [],
        currentUserId: parsed.currentUserId ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return { cameras: [], users: [], currentUserId: null };
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
}

function set(updater: (s: State) => State) {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

export const store = {
  getState: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  signIn: (userId: string) => set((s) => ({ ...s, currentUserId: userId })),
  signOut: () => set((s) => ({ ...s, currentUserId: null })),
  addUser: (u: Omit<User, "id" | "addedAt">) =>
    set((s) => ({
      ...s,
      users: [
        ...s.users,
        { ...u, id: `u_${Math.random().toString(36).slice(2, 9)}`, addedAt: new Date().toISOString() },
      ],
    })),
  upsertUser: (
    user: Partial<User> & Pick<User, "email"> & { id?: string; name?: string; role?: Role; photoURL?: string }
  ) =>
    set((s) => {
      const normalizedEmail = (user.email ?? "").trim().toLowerCase();
      const existing = s.users.find((entry) => entry.email.toLowerCase() === normalizedEmail);

      if (existing) {
        return {
          ...s,
          users: s.users.map((entry) =>
            entry.id === existing.id
              ? {
                  ...entry,
                  ...user,
                  id: entry.id,
                  email: entry.email,
                  role: normalizeRole(user.role ?? entry.role),
                  addedAt: entry.addedAt,
                  photoURL: user.photoURL ?? entry.photoURL,
                  avatarUrl: user.avatarUrl ?? entry.avatarUrl,
                }
              : entry,
          ),
        };
      }

      const nextUser: User = {
        id: user.id ?? `u_${Math.random().toString(36).slice(2, 9)}`,
        name: user.name ?? user.email,
        email: user.email,
        role: normalizeRole(user.role ?? (isAdminEmail(normalizedEmail) ? "admin" : "viewer")),
        photoURL: user.photoURL,
        avatarUrl: user.avatarUrl,
        addedAt: new Date().toISOString(),
      };

      return { ...s, users: [...s.users, nextUser] };
    }),
  upsertUserFromAuth: (authUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    name?: string | null;
  }) =>
    set((s) => {
      const email = authUser.email?.trim() ?? "";
      const normalizedEmail = email.toLowerCase();
      const existing = s.users.find((entry) => entry.email.toLowerCase() === normalizedEmail);
      const nextRole = normalizeRole(existing?.role ?? (isAdminEmail(normalizedEmail) ? "admin" : "viewer"));

      if (existing) {
        return {
          ...s,
          users: s.users.map((entry) =>
            entry.id === existing.id
              ? {
                  ...entry,
                  name: authUser.name ?? authUser.displayName ?? entry.name,
                  email: entry.email,
                  role: nextRole,
                  photoURL: authUser.photoURL ?? entry.photoURL,
                  avatarUrl: authUser.photoURL ?? entry.avatarUrl,
                }
              : entry,
          ),
        };
      }

      return {
        ...s,
        users: [
          ...s.users,
          {
            id: authUser.uid,
            name: authUser.name ?? authUser.displayName ?? (email || "User"),
            email,
            role: nextRole,
            photoURL: authUser.photoURL ?? undefined,
            avatarUrl: authUser.photoURL ?? undefined,
            addedAt: new Date().toISOString(),
          },
        ],
      };
    }),
  updateUserRole: (id: string, role: Role) =>
    set((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, role } : u)) })),
  removeUser: (id: string) =>
    set((s) => ({
      ...s,
      users: s.users.filter((u) => u.id !== id),
      currentUserId: s.currentUserId === id ? null : s.currentUserId,
    })),
  updateCamera: (id: string, patch: Partial<Camera>) =>
    set((s) => ({
      ...s,
      cameras: s.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  addCamera: (camera: Camera) =>
    set((s) => {
      const existingIndex = s.cameras.findIndex((entry) => entry.id === camera.id);
      if (existingIndex >= 0) {
        const next = [...s.cameras];
        next[existingIndex] = camera;
        return { ...s, cameras: next };
      }
      return { ...s, cameras: [...s.cameras, camera] };
    }),
  syncCameras: (cameras: Camera[]) =>
    set((s) => ({
      ...s,
      cameras,
    })),
  tickFloodData: () =>
    set((s) => ({
      ...s,
      cameras: s.cameras.map((c) => {
        const delta = (Math.random() - 0.5) * 0.08;
        const next = Math.max(0, Math.min(2.5, +(c.waterLevel + delta).toFixed(2)));
        return {
          ...c,
          waterLevel: next,
          floodStatus: statusFromLevel(next),
          timestamp: new Date().toISOString(),
        };
      }),
    })),
};

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export function useCurrentUser() {
  return useStore((s) => (s.currentUserId ? (s.users.find((u) => u.id === s.currentUserId) ?? null) : null));
}