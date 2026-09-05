import ProfilePage from "@/pages/ProfilePage.jsx";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile · FloodSight" },
      { name: "description", content: "User profile and account settings." },
    ],
  }),
  component: ProfilePage,
});
