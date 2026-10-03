"use client";

import ErrorView from "@/components/layout/ErrorView";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorView
      error={error}
      reset={reset}
      title="Ops! Algo inesperado aconteceu"
      description="Houve uma falha inesperada na aplicação. Você pode tentar recarregar ou retornar à página inicial."
      homeHref="/"
      isFullScreen
    />
  );
}
