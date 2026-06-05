# 🛠️ Guia de Instalação e Execução Local

Este guia orienta desenvolvedores passo a passo na configuração do ambiente local de desenvolvimento, instalação de dependências, provisionamento do banco de dados e execução da suíte de ferramentas de qualidade do **OptSolv Time Tracker**.

---

## 📋 Pré-requisitos

Antes de iniciar, certifique-se de ter instalado em sua máquina:
1.  **Node.js:** Versão LTS recomendada (v20 ou superior).
2.  **PNPM:** Gerenciador de pacotes rápido e eficiente (`npm i -g pnpm`).
3.  **PostgreSQL:** Banco de dados relacional local ou uma instância acessível do *Azure Database for PostgreSQL*.

---

## 🚀 Passo a Passo de Setup

### Passo 1: Clone o Repositório e Instale as Dependências
Clone o repositório do projeto no Azure DevOps e instale as dependências usando o PNPM:
```bash
git clone https://github.com/optsolv/optsolv-time-tracker.git
cd optsolv-time-tracker
pnpm install
```

### Passo 2: Configuração das Variáveis de Ambiente
Duplique o arquivo modelo `.env.example` na raiz do projeto para criar o seu `.env.local`:
```bash
cp .env.example .env.local
```

Abra o arquivo `.env.local` e configure as chaves necessárias:
```env
# Conexão com o Banco de Dados (Azure PostgreSQL)
DATABASE_URL="postgresql://app_user:password@localhost:5432/opt-timer?sslmode=disable"

# Configurações de Autenticação (Better Auth)
BETTER_AUTH_SECRET="gerar-uma-chave-secreta-forte-de-32-chars"
BETTER_AUTH_URL="http://localhost:3000"

# SSO Integrado com a Conta Microsoft corporativa (Entra ID)
MICROSOFT_CLIENT_ID="seu-client-id-registrado-no-portal-azure"
MICROSOFT_CLIENT_SECRET="seu-client-secret-gerado-no-portal-azure"

# Integrações Externas (Opcional - Token do Azure DevOps)
AZURE_DEVOPS_PAT="seu-personal-access-token-do-azure-devops"
```
> ⚠️ **IMPORTANTE:** Nunca adicione o prefixo `NEXT_PUBLIC_` para variáveis sensíveis como senhas ou tokens PAT. Variáveis com esse prefixo são injetadas no bundle do cliente JavaScript e podem ser inspecionadas no navegador.

### Passo 3: Provisionamento e Migração do Banco de Dados
O projeto utiliza o **Drizzle Kit** para versionar e aplicar as tabelas no PostgreSQL. Rode os comandos para sincronizar seu schema:

*   **Para sincronizar o schema no banco de desenvolvimento:**
    ```bash
    pnpm exec drizzle-kit push
    ```
*   **Para rodar a interface visual do Drizzle Studio (Painel gráfico local de tabelas):**
    ```bash
    pnpm exec drizzle-kit studio
    ```

---

## 💻 Comandos e Scripts Úteis

A tabela abaixo descreve os scripts cadastrados no [package.json](file:///c:/Users/mgalv/Projetos-Programacao/Projetos-Treino/harvest/package.json):

| Comando | Descrição |
| :--- | :--- |
| `pnpm run dev` | Inicia o servidor Next.js em modo desenvolvimento na porta `3000`. |
| `pnpm run build` | Executa a compilação do Next.js gerando a versão de produção. |
| `pnpm run start` | Inicia o servidor Next.js servindo o bundle compilado. |
| `pnpm run start:standalone` | Executa o Next.js no modo standalone (ideal para contêineres Docker e Azure Web Apps). |
| `pnpm run lint` | Executa a análise estática rápida de estilo e código via Biome. |
| `pnpm run format` | Corrige automaticamente a formatação do código em todos os arquivos compatíveis. |
| `pnpm run video:studio` | Abre o painel do Remotion Studio para pré-visualizar o vídeo institucional em código. |
| `pnpm run video:render` | Renderiza e compila o vídeo institucional MP4 a partir do código do Remotion. |

---

## 🛠️ Baseline de Qualidade Obrigatória

Antes de enviar qualquer pull request para revisão, garanta que seu código passa nos seguintes checks de integridade local:

### 1. Compilação TypeScript (Sem erros de tipagem)
```bash
pnpm exec tsc --noEmit
```

### 2. Validação Biome (Linter & Formatter)
```bash
pnpm run lint
```
Se houver problemas fáceis de corrigir, use:
```bash
pnpm run format
```

---

[⬅️ Voltar para a Página Inicial](Home.md)
