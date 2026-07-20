import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext.jsx";
import { useNavigate } from "@tanstack/react-router";

function RoleBadge({ isAdmin, role }) {
  if (isAdmin) {
    return (
      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1 text-white text-xs">
        Admin
      </span>
    );
  }
  if (role === "authority" || role === "authorities") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-500 px-3 py-1 text-white text-xs">
        Authority
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-300 px-3 py-1 text-gray-800 text-xs">
      Viewer
    </span>
  );
}

export default function ProfilePage() {
  const { user, isAdmin, role, logout, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-100 text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  const initials = (user.name || user.email || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col items-center gap-4">
          <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-white shadow-md bg-accent">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.name || user.email || "Profile"} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-accent-foreground">
                {initials}
              </div>
            )}
          </div>

          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{user.name}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
            <div className="mt-3">
              <RoleBadge isAdmin={isAdmin} role={role} />
            </div>
          </div>

          <div className="w-full mt-6 flex flex-col gap-3">
            <button
              onClick={() => navigate({ to: "/" })}
              className="w-full rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Back to dashboard
            </button>

            <button
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
              className="w-full rounded-md bg-red-50 text-red-700 border border-red-100 px-4 py-2 text-sm hover:bg-red-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
