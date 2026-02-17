import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getDashboardData } from "@/lib/api";
import type { DashboardData } from "@/types/models";

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await getDashboardData();
      setData(next);
    } catch (error) {
      toast.error(`Failed to load dashboard: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, setData, loading, refresh };
}
