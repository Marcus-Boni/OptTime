"use client";

import ErrorView from "@/components/layout/ErrorView";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-neutral-950 font-sans text-white antialiased">
        <ErrorView
          error={error}
          reset={reset}
          title="Erro crítico no sistema"
          description="Ocorreu um erro inesperado no carregamento da estrutura do sistema. Tente reiniciar a visualização abaixo."
          homeHref="/"
          isFullScreen
        />
      </body>
    </html>
  );
}
