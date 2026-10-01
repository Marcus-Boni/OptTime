# Homepage e última release publicada

A homepage lê a última release com `status = published`, ordenada por data de publicação, criação e ID. A consulta usa somente versão, título e vídeo; notas completas, autor e rascunhos não são enviados para a página pública.

Depois do deploy deste ajuste, publicar, editar ou remover uma release passa a atualizar o selo e a seção de novidades na próxima visita ou recarga da homepage. A rota é dinâmica, sem cópia estática da versão ou cache de página que precise ser invalidado no formulário.

- Com uma release publicada: exibe sua versão e título, usando seu `videoUrl` no mesmo player da página Releases.
- Sem vídeo nessa release: mantém a versão e o título e informa que o vídeo ainda não está disponível.
- Sem release publicada ou com falha na consulta: mantém a apresentação geral e omite o selo e as novidades, sem anunciar a versão do pacote ainda não publicada.
- MP4, YouTube e Loom seguem o vídeo configurado. Uma composição Remotion precisa estar registrada no código implantado; um ID desconhecido mostra indisponibilidade, sem substituir pelo vídeo de outra versão.

Arquivos: `src/app/page.tsx`, `src/lib/releases/public-release.server.ts`, `src/lib/releases/public-release.ts`, `src/components/landing/navbar.tsx`, `src/components/landing/video-demo.tsx`, `src/components/landing/features-bento.tsx` e `src/components/releases/ReleaseVideoPlayer.tsx`.

Regressões em `scripts/verify-public-release.ts`: exclusão de rascunhos, ausência de release, redução aos campos públicos, normalização de versão, seleção exata de composição e MP4 com versão no nome. Os seletores Remotion agora usam correspondência exata, eliminando o caso em que um link de MP4 era interpretado como composição.

Validação: build de produção, TypeScript, Biome dos arquivos alterados, regressões e contrato de onboarding passaram. A homepage de produção local foi inspecionada sem login, lendo a v1.8.0 publicada no banco configurado: selo, aba de novidades, título e player correspondiam à mesma release, mesmo com os metadados do pacote preparados para 1.9.0. Não houve publicação ou alteração no banco durante a verificação.
