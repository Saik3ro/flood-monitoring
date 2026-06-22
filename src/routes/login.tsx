import LoginPage from "@/components/auth/Login.jsx";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · SUBAY Flood Watch" },
      { name: "description", content: "Sign in to the SUBAY CCTV flood monitoring dashboard." },
    ],
  }),
  component: LoginPage,
});
