"use client";

import ErrorView from "@/components/layout/ErrorView";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <ErrorView
        error={error}
        reset={reset}
        title="Erro ao carregar esta área do painel"
        description="Ocorreu um problema ao renderizar esta página. Suas informações estão preservadas e você pode tentar recarregá-la abaixo."
        homeHref="/dashboard"
      />
    </div>
  );
}
