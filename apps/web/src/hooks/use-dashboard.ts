"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardSummaryDto } from "@cometkit/shared";
import { api } from "@/lib/api";

export const dashboardKeys = {
  summary: ["dashboard-summary"] as const,
};

/** Admin home summary: tenant-scoped KPI counts, operational signal lists, recent packages. */
export function useDashboardSummary() {
  return useQuery<DashboardSummaryDto>({
    queryKey: dashboardKeys.summary,
    queryFn: () => api.get("dashboard/summary").json<DashboardSummaryDto>(),
  });
}
