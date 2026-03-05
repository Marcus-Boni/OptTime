import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import type { UpdateProfileInput } from "@/lib/validations/profile.schema";

interface UseUpdateProfileReturn {
  isSaving: boolean;
  updateProfile: (data: UpdateProfileInput) => Promise<boolean>;
}

/**
 * Hook centralizado para atualizar dados do perfil do usuário.
 * Chama PATCH /api/user/profile e, em seguida, re-sincroniza a sessão via authClient.
 * Retorna `true` em caso de sucesso e `false` em caso de erro.
 */
export function useUpdateProfile(): UseUpdateProfileReturn {
  const [isSaving, setIsSaving] = useState(false);

  async function updateProfile(data: UpdateProfileInput): Promise<boolean> {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Erro ao salvar alterações";
        toast.error(message);
        return false;
      }

      // Refresh da sessão para propagar o novo nome/departamento/capacidade
      await authClient.getSession({ query: { disableCookieCache: true } });

      toast.success("Perfil atualizado com sucesso!");
      return true;
    } catch (err: unknown) {
      console.error("[useUpdateProfile] updateProfile:", err);
      toast.error("Erro de rede. Tente novamente.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, updateProfile };
}
