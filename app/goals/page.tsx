import { redirect } from "next/navigation";

// The race goal lives on Progress (overhaul Phase 3; formerly Plan's goal tab).
// Kept as a redirect so existing links and bookmarks still land on it.
export default function GoalsPage() {
  redirect("/progress");
}
