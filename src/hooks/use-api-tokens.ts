"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ApiTokenPreset, ApiTokenSummary } from "@/lib/api-tokens.shared";

/**
 * Personal access tokens for AI agents.
 *
 * `createdToken` holds the plaintext of the token minted in this session only.
 * It lives in component state and is dropped on unmount — the API has no way to
 * return it again, which is the point.
 */

export interface CreateTokenInput {
  name: string;
  preset: ApiTokenPreset;
  expiresInDays: number | null;
}

interface UseApiTokensReturn {
  tokens: ApiTokenSummary[];
  isLoading: boolean;
  isCreating: boolean;
  revokingId: string | null;
  createdToken: { plaintext: string; token: ApiTokenSummary } | null;
  createToken: (input: CreateTokenInput) => Promise<boolean>;
  revokeToken: (id: string) => Promise<boolean>;
  dismissCreatedToken: () => void;
  refresh: () => Promise<void>;
}

export function useApiTokens(): UseApiTokensReturn {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<{
    plaintext: string;
    token: ApiTokenSummary;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/api-tokens");
      if (!res.ok) throw new Error("Falha ao carregar tokens.");
      const data = (await res.json()) as { tokens: ApiTokenSummary[] };
      setTokens(data.tokens ?? []);
    } catch (error: unknown) {
      console.error("[useApiTokens] refresh:", error);
      toast.error("Não foi possível carregar seus tokens.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createToken = useCallback(
    async (input: CreateTokenInput): Promise<boolean> => {
      setIsCreating(true);
      try {
        const res = await fetch("/api/user/api-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        const payload = (await res.json()) as {
          plaintext?: string;
          token?: ApiTokenSummary;
          error?: string;
        };

        if (!res.ok || !payload.plaintext || !payload.token) {
          throw new Error(payload.error ?? "Falha ao criar o token.");
        }

        setCreatedToken({
          plaintext: payload.plaintext,
          token: payload.token,
        });
        setTokens((current) => [payload.token as ApiTokenSummary, ...current]);
        toast.success(
          "Token criado. Copie agora — ele não será exibido de novo.",
        );
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Falha ao criar o token.";
        console.error("[useApiTokens] createToken:", error);
        toast.error(message);
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const revokeToken = useCallback(async (id: string): Promise<boolean> => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/user/api-tokens/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Falha ao revogar o token.");
      }

      setTokens((current) => current.filter((item) => item.id !== id));
      setCreatedToken((current) => (current?.token.id === id ? null : current));
      toast.success("Token revogado. Os agentes que o usavam perderão acesso.");
      return true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Falha ao revogar o token.";
      console.error("[useApiTokens] revokeToken:", error);
      toast.error(message);
      return false;
    } finally {
      setRevokingId(null);
    }
  }, []);

  const dismissCreatedToken = useCallback(() => setCreatedToken(null), []);

  return {
    tokens,
    isLoading,
    isCreating,
    revokingId,
    createdToken,
    createToken,
    revokeToken,
    dismissCreatedToken,
    refresh,
  };
}
