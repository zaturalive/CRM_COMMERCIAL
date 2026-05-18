"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Hook simple pour list/reload un endpoint GET.
 * Volontairement minimaliste (pas de react-query pour limiter la dette MVP).
 */
export function useApiList<T>(path: string, dependencies: unknown[] = []) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<T[]>(path);
    if (res.success) {
      setData(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...dependencies]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/**
 * Hook pour un GET /:id.
 */
export function useApiOne<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<T>(path);
    if (res.success) setData(res.data);
    else setError(res.error);
    setLoading(false);
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
