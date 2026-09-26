# Memória do dia no Microsoft 365

O botão **Preencher meu dia** combina a agenda existente com três pistas opcionais:
arquivos modificados pelo próprio profissional, presença real em reuniões do
Teams que ele organizou e uma descrição curta baseada na transcrição disponível.
Todas entram como propostas editáveis. Nenhuma gravação, transcrição completa ou
lista de participantes é persistida no banco.

## Permissões e ativação

O login padrão continua com os escopos atuais. No diálogo de reconstrução, o
profissional pode conectar as fontes adicionais via autorização incremental do
Better Auth. Antes de usar em produção, o administrador do tenant precisa
conceder estas permissões **delegadas** ao App Registration no Microsoft Entra:

| Permissão | Uso |
| --- | --- |
| `Files.Read.All` | Microsoft Search nos arquivos SharePoint/OneDrive aos quais o usuário tem acesso |
| `OnlineMeetings.Read` | Resolver a reunião pelo `joinWebUrl` do convite |
| `OnlineMeetingArtifact.Read.All` | Ler o relatório de presença após a reunião |
| `OnlineMeetingTranscript.Read.All` | Ler a transcrição disponível para resumir |

Depois da concessão administrativa, o profissional usa **Conectar memória
Microsoft 365** no diálogo. O fluxo `linkSocial` amplia os escopos apenas daquela
conta. Uma autorização anterior não ganha novos escopos por simples refresh do
token. Se o tenant negar a autorização, as fontes opcionais não impedem o
lançamento manual nem as fontes já conectadas.

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
- **Transcrições:** disponíveis apenas se a reunião tiver transcrição e se a
  política do tenant permitir o acesso. O texto é lido sob demanda ao reconstruir
  o dia, limitado e sanitizado antes de ir ao provedor de IA já configurado. Só
  a frase gerada segue para o plano, para revisão antes de salvar. Reuniões sem
  transcrição mantêm a descrição vinda da agenda.
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
- [Recent depreciado](https://learn.microsoft.com/en-us/graph/api/drive-recent?view=graph-rest-1.0)
- [Used depreciado](https://learn.microsoft.com/en-us/graph/api/insights-list-used?view=graph-rest-1.0)
