import LoginPage from "@/components/auth/Login.jsx";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · FloodSight" },
      { name: "description", content: "Sign in to the FloodSight CCTV flood monitoring dashboard." },
    ],
  }),
  component: LoginPage,
});
