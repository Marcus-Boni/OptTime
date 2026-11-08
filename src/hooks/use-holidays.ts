"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  HolidayScope,
  HolidaySummary,
  SyncHolidaysResult,
} from "@/lib/holidays";

export interface UseHolidaysRangeOptions {
  from: string;
  to: string;
  includeInactive?: boolean;
}

export function useHolidaysRange({
  from,
  to,
  includeInactive = false,
}: UseHolidaysRangeOptions) {
  const [holidays, setHolidays] = useState<HolidaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHolidays = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ from, to });
      if (includeInactive) {
        params.set("includeInactive", "true");
      }

      const res = await fetch(`/api/holidays?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Não foi possível carregar os feriados.");
      }

      const json = (await res.json()) as { holidays?: HolidaySummary[] };
      setHolidays(json.holidays ?? []);
    } catch (err: unknown) {
      console.error("[useHolidaysRange] fetchHolidays:", err);
      setError(
        err instanceof Error ? err.message : "Erro ao carregar feriados.",
      );
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [from, includeInactive, to]);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays]);

  return {
    holidays,
    loading,
    error,
    refetch: fetchHolidays,
  };
}

export function useHolidayAdmin(year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { holidays, loading, error, refetch } = useHolidaysRange({
    from,
    to,
    includeInactive: true,
  });

  const syncYear = useCallback(async (): Promise<SyncHolidaysResult> => {
    const res = await fetch("/api/holidays/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year }),
    });
    if (!res.ok) {
      throw new Error("Falha ao sincronizar feriados do ano.");
    }
    const result = (await res.json()) as SyncHolidaysResult;
    await refetch();
    return result;
  }, [refetch, year]);

  const createHoliday = useCallback(
    async (input: {
      date: string;
      name: string;
      scope: HolidayScope;
      isActive?: boolean;
    }): Promise<HolidaySummary> => {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error("Falha ao cadastrar feriado ou emenda.");
      }
      const json = (await res.json()) as { holiday: HolidaySummary };
      await refetch();
      return json.holiday;
    },
    [refetch],
  );

  const toggleHoliday = useCallback(
    async (id: string, isActive: boolean): Promise<HolidaySummary> => {
      const res = await fetch(`/api/holidays/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        throw new Error("Falha ao atualizar status do feriado.");
      }
      const json = (await res.json()) as { holiday: HolidaySummary };
      await refetch();
      return json.holiday;
    },
    [refetch],
  );

  const deleteHoliday = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/holidays/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Falha ao remover feriado.");
      }
      await refetch();
    },
    [refetch],
  );

  return {
    holidays,
    loading,
    error,
    refetch,
    syncYear,
    createHoliday,
    toggleHoliday,
    deleteHoliday,
  };
}
