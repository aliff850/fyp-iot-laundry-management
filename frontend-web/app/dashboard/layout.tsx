import { redirect } from "next/navigation";

// Phase 1 fence: a Supabase identity alone cannot authorize this prototype.
export default function DashboardLayout() {
  redirect("/membership-status?next=%2Fdashboard");
}
