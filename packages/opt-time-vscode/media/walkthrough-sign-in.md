## Token pessoal

1. Abra **Configurações → Integrações** no dashboard do OptSolv.
2. Gere um token com o preset **Registrar horas** (`time:read` + `time:write`).
3. Copie o valor `opt_tok_…` — ele aparece uma única vez.
4. Rode **Opt-Time: Conectar Conta** e cole o token.

O token é guardado no cofre de credenciais do sistema operacional, via
`SecretStorage`. Ele nunca é escrito em `settings.json` nem sincronizado.
