# 🔌 Integração com Azure DevOps e API Externa

A integração nativa com o **Azure DevOps** é o principal diferencial estratégico do **OptSolv Time Tracker**, permitindo sincronizar de maneira automatizada e transparente o progresso técnico com a folha de horas dos colaboradores.

---

## 🔄 Sincronização Bidirecional de Work Items

Quando um colaborador vincula um registro de tempo (seja pelo Timer ativo ou por lançamento manual) a uma tarefa do Azure DevOps (Work Item), o sistema executa as seguintes ações:

### 1. Atualização Automática de Campo
*   O sistema atualiza o campo **Completed Work** (`Microsoft.VSTS.Scheduling.CompletedWork`) diretamente na tarefa do Azure DevOps (Task ou Bug).
*   Se o usuário alterar a duração do registro de tempo no Time Tracker, a diferença é recalculada e reajustada no Azure DevOps.

### 2. Autocomplete e Busca Inteligente
*   Na tela de lançamento de horas, ao digitar um caractere, o sistema realiza uma busca debouncada (300ms) conectando-se ao Azure DevOps por meio do seu cliente REST.
*   Usuários podem buscar de duas formas:
    *   **Pelo ID:** Digitando `#1243` o sistema localiza a tarefa instantaneamente.
    *   **Pelo Título:** Digitando termos (mínimo 3 caracteres) como `"Criar componente"` o sistema busca tarefas ativas atribuídas ao colaborador no projeto.

```
┌─────────────────┐       (ID / Título)      ┌───────────────────────┐
│  Time Tracker   ├─────────────────────────➔│ Azure DevOps REST API │
│                 │  (Completed Work Sync)  │                       │
│  Timer / Manual │◀─────────────────────────┤ Tasks, Bugs & Stories │
└─────────────────┘                          └───────────────────────┘
```

---

## 🧩 Extensão de Boards Dedicada (`azure-devops-extension`)

O repositório abriga uma pasta especial [azure-devops-extension](file:///c:/Users/mgalv/Projetos-Programacao/Projetos-Treino/harvest/azure-devops-extension) que contém uma extensão oficial empacotada para o Azure DevOps.
*   **O que ela faz:** Quando instalada na organização do Azure DevOps, ela injeta um widget personalizado ou um painel lateral na tela de visualização de Work Items das Boards.
*   **Funcionamento:** Os colaboradores podem iniciar o timer ou registrar horas do projeto atual diretamente de dentro do Azure DevOps, sem a necessidade de alternar abas no navegador. A extensão conversa com a API do Time Tracker sob o capô por meio de autenticação de sessão.

---

## 🔒 API de Integração Machine-to-Machine (M2M v1)

Para permitir que outros sistemas internos da OptSolv conversem com a plataforma de horas, o sistema disponibiliza uma API REST de integração `/api/v1` em paralelo à API de usuários.

### 1. Autenticação Corporativa (Microsoft Entra ID)
A autenticação de aplicações de terceiros é feita via fluxo **OAuth2 Client Credentials** no Tenant corporativo:
*   A aplicação consumidora deve estar cadastrada no Microsoft Entra ID.
*   Ela solicita um token JWT enviando seu `client_id` e `client_secret` ao endpoint da Microsoft.
*   O Time Tracker valida o token decodificando o JWT e verificando os escopos atribuídos (Roles):
    *   `opt-time.read` (Leitura de apontamentos, projetos e usuários)
    *   `opt-time.write` (Escrita de registros)
    *   `opt-time.admin` (Configurações avançadas e Webhooks)

### 2. Webhooks e Segurança HMAC
Sistemas integrados podem se inscrever para receber atualizações automáticas via webhook (ex: "Timesheet Aprovado").
*   **Assinatura de Segurança:** Cada payload enviado contém o header `X-OptSolv-Signature: sha256=<hex-hash>`.
*   O receptor deve validar a assinatura usando a chave secreta HMAC cadastrada para garantir a autenticidade da requisição:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

*   **Agenda de Retentativas:** Caso o sistema de destino esteja fora do ar, as tentativas de entrega de webhooks são repetidas em formato de backoff exponencial:
    *   **Tentativa 2:** 1 minuto após a falha
    *   **Tentativa 3:** 2 minutos após a falha
    *   **Tentativa 4:** 4 minutos após a falha
    *   **Tentativa 5:** 8 minutos após a falha
    *   **Tentativa 6 (Final):** 16 minutos (Após isso, é marcado como `failed`)

### 3. Limites de Taxa (Rate Limits)
Para proteção contra sobrecargas, a API REST impõe um limite padrão de **600 requisições por minuto** por `client_id`. Os headers de resposta informam o estado atual:
*   `X-RateLimit-Limit`: Limite máximo da janela.
*   `X-RateLimit-Remaining`: Requisições restantes.
*   `X-RateLimit-Reset`: Timestamp Unix de expiração da janela.

---

[⬅️ Voltar para a Página Inicial](Home.md)
