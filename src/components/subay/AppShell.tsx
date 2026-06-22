import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, LayoutDashboard, Settings, Users, Waves } from "lucide-react";
import { useAuth } from "@/context/AuthContext.jsx";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/config", label: "Camera Config", icon: Settings, show: isAdmin },
    { to: "/users", label: "User Access", icon: Users, show: isAdmin },
  ];

  const handleAvatarClick = () => {
    navigate({ to: "/profile" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Waves className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight">SUBAY</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Flood Watch · CDO
              </div>
            </div>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {nav
              .filter((n) => n.show)
              .map((n) => {
                const active = pathname === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <n.icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <>
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium leading-tight">{user.name}</div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {isAdmin ? "Admin" : "User"}
                  </div>
                </div>
                <button
                  onClick={handleAvatarClick}
                  className="relative h-9 w-9 rounded-full overflow-hidden border-2 border-transparent hover:border-primary hover:shadow-lg hover:scale-110 transition-all cursor-pointer"
                  title="View Profile"
                  aria-label="View Profile"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-accent text-sm font-semibold text-accent-foreground">
                      {user.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                  )}
                </button>
                <button
                  onClick={logout}
                  className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border md:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
            {nav
              .filter((n) => n.show)
              .map((n) => {
                const active = pathname === n.to;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <n.icon className="h-3.5 w-3.5" />
                    {n.label}
                  </Link>
                );
              })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}