# Memória do dia no Microsoft 365

O botão **Preencher meu dia** combina a agenda existente com arquivos modificados
pelo próprio profissional, presença em reuniões quando há relatório autorizado
e participação em chamadas do Teams. Chamadas também aparecem nas sugestões
inteligentes, no painel diário e em **Meu tempo**.
Todas entram como propostas editáveis. Nenhuma gravação, transcrição completa ou
lista de participantes é persistida no banco.

## Permissões e ativação

O login padrão continua com os escopos atuais. No diálogo de reconstrução, o
profissional pode conectar as fontes adicionais via autorização incremental do
Better Auth. Antes de usar em produção, o administrador do tenant precisa
configurar as permissões correspondentes no App Registration no Microsoft Entra:

| Permissão | Tipo | Uso |
| --- | --- | --- |
| `Sites.Read.All` ou `Files.Read.All` | Delegada | Microsoft Search nos arquivos acessíveis ao usuário |
| `OnlineMeetings.Read` | Delegada | Resolver a reunião pelo `joinWebUrl` do convite |
| `OnlineMeetingArtifact.Read.All` | Delegada | Opcional: relatório de presença após a reunião; não faz parte das permissões informadas para esta entrega |
| `CallRecords.Read.All` | Aplicação | Sessões de chamadas do Teams, com consentimento administrativo |

Depois da concessão administrativa, o profissional usa **Conectar memória
Microsoft 365** no diálogo. O fluxo `linkSocial` amplia os escopos apenas daquela
conta. Uma autorização anterior não ganha novos escopos por simples refresh do
token. Se o tenant negar a autorização, as fontes opcionais não impedem o
lançamento manual nem as fontes já conectadas.

Chamadas usam as credenciais de servidor já existentes: `MICROSOFT_TENANT_ID`,
`MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`. Tenant e cliente devem ser GUIDs.
O token delegado identifica o usuário via `/me`; a consulta de aplicação filtra
por esse ID e confere novamente a identidade em cada sessão. Sem identidade
verificável, nenhuma chamada é retornada. Não é preciso reconectar o usuário
para conceder `CallRecords.Read.All` ao aplicativo.

## Limites exibidos ao profissional

- **Documentos:** Microsoft Search fornece o horário da última modificação e o
  editor do arquivo. Só documentos cujo email ou ID Entra do editor corresponde ao usuário são
  sugeridos. O horário é uma pista pontual; os 15 minutos iniciais são um valor
  editável, não duração medida. O sistema só vincula o documento quando há uma
  única correspondência de nome/código/cliente entre projetos acessíveis.
- **Teams:** o relatório de presença pode ser lido após a reunião e, no fluxo
  delegado, pelo organizador. A duração resulta dos intervalos do próprio
  profissional, com sobreposições eliminadas. Sem relatório, vale a proposta
  baseada na agenda, identificada como tal. O relatório de uma ocorrência
  recorrente não pode ser aplicado a outra ocorrência.
- **Chamadas do Teams:** chamadas diretas ou em grupo sem convite de agenda
  entram por `CallRecords.Read.All` como permissão **Application** aprovada pelo
  administrador do tenant, não por reconexão individual do usuário. A UI mostra
  apenas a participação medida do profissional, com sobreposição de agenda
  removida, e exige revisão + escolha de projeto antes de salvar. O Graph não
  retorna call records com mais de 30 dias; portanto chamadas antigas ficam fora
  da reconstrução. Este fluxo não busca nem persiste gravações ou transcrições
  de chamadas.
- **Transcrições e gravações:** a reconstrução atual não consulta essas fontes.
  `CallRecordings.Read.All` não é necessário para sugerir tempo a partir de sessões.
- Chamadas são consultadas com paginação limitada e prazo total de 15 segundos.
  Histórico parcial, falta de configuração e acesso negado aparecem como estado
  da fonte. Sobreposições com a agenda são removidas conservadoramente, inclusive
  quando não é possível confirmar que uma chamada e um convite são o mesmo evento.
- A aplicação guarda a identificação da chamada no feedback existente, junto com
  o lançamento, para não reapresentá-la após editar sua descrição. Excluir esse
  lançamento não desfaz a aceitação da sugestão; ele pode ser recriado manualmente.
  O fluxo de revisão verifica duplicidade sob bloqueio transacional por usuário/dia.
- A busca limita a 50 arquivos e enriquece até 3 reuniões por abertura para
  manter tempo de resposta e uso do Graph previsíveis.

Não usar `/me/insights/used` ou `/me/drive/recent` como base nova: ambos estão
depreciados e deixarão de retornar dados após novembro de 2026. Microsoft
Search não reconstrói sessões contínuas de edição nem eventos de mera abertura.

## Referências

- [Microsoft Search para OneDrive e SharePoint](https://learn.microsoft.com/en-us/graph/search-concept-files)
- [Consulta Search API](https://learn.microsoft.com/en-us/graph/api/search-query?view=graph-rest-1.0)
- [Reunião online por joinWebUrl](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get?view=graph-rest-1.0)
- [Relatórios de presença](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-list?view=graph-rest-1.0)
- [Transcrições de reuniões](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0)
- [Call records API FAQ](https://learn.microsoft.com/en-us/graph/callrecords-api-faq)
- [Permissão CallRecords.Read.All](https://learn.microsoft.com/en-us/graph/permissions-reference#callrecordsreadall)
- [Recent depreciado](https://learn.microsoft.com/en-us/graph/api/drive-recent?view=graph-rest-1.0)
- [Used depreciado](https://learn.microsoft.com/en-us/graph/api/insights-list-used?view=graph-rest-1.0)
