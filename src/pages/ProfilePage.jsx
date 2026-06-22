import React, { useEffect, useState } from "react";
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
        Authorities
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
  const [adminMode, setAdminMode] = useState(() => {
    try {
      return localStorage.getItem("subay_admin_mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const toggleAdminMode = () => {
    const next = !adminMode;
    setAdminMode(next);
    try {
      localStorage.setItem("subay_admin_mode", String(next));
    } catch {}
  };

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-gray-100 text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col items-center gap-4">
          <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-white shadow-md">
            <img src={user.photoURL} alt={user.name} className="h-full w-full object-cover" />
          </div>

          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{user.name}</div>
            <div className="text-sm text-gray-500">{user.email}</div>
            <div className="mt-3">
              <RoleBadge isAdmin={isAdmin} role={role} />
            </div>
          </div>

          {isAdmin && (
            <div className="w-full mt-4">
              <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Admin Mode</div>
                  <div className="text-xs text-gray-500">Toggle to enable admin features</div>
                </div>
                <div>
                  <button
                    onClick={toggleAdminMode}
                    aria-pressed={adminMode}
                    className={`h-6 w-12 rounded-full p-0.5 ${
                      adminMode ? "bg-indigo-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white transform transition ${
                        adminMode ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </label>
              <div className="mt-2 text-xs text-gray-500">Status: {adminMode ? "Admin Mode" : "User Mode"}</div>
            </div>
          )}

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
