import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/membership-status?next=%2Fdashboard");
}
