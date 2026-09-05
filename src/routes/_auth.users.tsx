import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldAlert } from "lucide-react";
import { store, useStore } from "@/lib/floodsight/store";
import { useAuth } from "@/context/AuthContext.jsx";
import type { Role } from "@/lib/floodsight/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_auth/users")({
  head: () => ({
    meta: [
      { title: "User Access · FloodSight" },
      { name: "description", content: "Manage FloodSight dashboard users and roles." },
    ],
  }),
  component: UsersPage,
});

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  authority: "Authority",
  viewer: "Viewer",
};

function UsersPage() {
  const { user, isAdmin } = useAuth();
  const users = useStore((s) => s.users);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  useEffect(() => {
    if (isAdmin === false) navigate({ to: "/" });
  }, [isAdmin, navigate]);

  if (isAdmin === false) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    store.addUser({ name: name.trim(), email: email.trim(), role });
    toast.success(`Added ${name}`, { description: ROLE_LABEL[role] });
    setName("");
    setEmail("");
    setRole("viewer");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">User Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage authenticated Google accounts and assign roles. The list is populated from the current signed-in users.
        </p>
      </header>

      <form
        onSubmit={addUser}
        className="grid gap-3 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_1fr_180px_auto]"
      >
        <input
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          required
          type="email"
          placeholder="name@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="admin">Admin</option>
          <option value="authority">Authority</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          type="submit"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add user
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-accent/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {u.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span className="font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => {
                      store.updateUserRole(u.id, e.target.value as Role);
                      toast.success(`Updated ${u.name}'s role`);
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="authority">Authority</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.addedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      if (u.id === user?.uid) {
                        toast.error("You can't remove yourself.");
                        return;
                      }
                      store.removeUser(u.id);
                      toast.success(`Removed ${u.name}`);
                    }}
                    className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${u.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}