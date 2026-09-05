import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/floodsight/AppShell";
import { useAuth } from "@/context/AuthContext.jsx";
import PrivateRoute from "@/components/auth/PrivateRoute.jsx";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginRoute = location.pathname === "/login";

  useEffect(() => {
    if (!loading && !user && !isLoginRoute) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, loading, isLoginRoute, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  if (!user && isLoginRoute) {
    return <Outlet />;
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <PrivateRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </PrivateRoute>
  );
}