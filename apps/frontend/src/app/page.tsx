import { redirect } from "next/navigation";

// Redirige vers /dashboard. Le middleware fait le guard auth.
export default function HomePage() {
  redirect("/dashboard");
}
