import { useState } from "react";
import logoUrl from "../../assets/logo-white.svg";
import { getMe } from "../../shared/api";
import { saveCredentials } from "../../shared/auth";

interface Props {
  onConfigured: () => void;
}

export function SetupScreen({ onConfigured }: Props) {
  const [apiUrl, setApiUrl] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);
    if (!apiUrl.trim() || !token.trim()) {
      setError("Preencha a URL da aplicação e o token.");
      return;
    }

    setLoading(true);
    try {
      // Save credentials first so the api client can use them
      saveCredentials(apiUrl.trim(), token.trim());

      // Validate by calling /api/extension/me
      await getMe();
      onConfigured();
    } catch {
      setError("Token inválido ou URL incorreta. Verifique e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <Logo />
        <div>
          <div style={s.title}>OptSolv Time Tracker</div>
          <div style={s.subtitle}>Configure a extensão para começar</div>
        </div>
      </div>

      {/* Instructions */}
      <div style={s.infoBox}>
        <strong>Como configurar:</strong>
        <ol style={s.list}>
          <li>
            Acesse a aplicação OptSolv Time Tracker e vá em{" "}
            <strong>Integrações → Azure DevOps → Extensão</strong>.
          </li>
          <li>Gere um Token de Extensão e copie-o.</li>
          <li>Preencha os campos abaixo e clique em Conectar.</li>
        </ol>
      </div>

      {/* Form */}
      <div style={s.form}>
        <div style={s.field}>
          <label style={s.label} htmlFor="apiUrl">
            URL da Aplicação
          </label>
          <input
            id="apiUrl"
            style={s.input}
            type="url"
            placeholder="https://app.optsolv.com"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            disabled={loading}
          />
        </div>

        <div style={s.field}>
          <label style={s.label} htmlFor="token">
            Token de Extensão
          </label>
          <input
            id="token"
            style={s.input}
            type="password"
            placeholder="Cole o token gerado na aplicação"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
          />
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <button
          style={loading ? { ...s.button, ...s.buttonDisabled } : s.button}
          type="button"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? "Conectando…" : "Conectar"}
        </button>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div
      style={{
        background: "var(--brand)",
        borderRadius: "8px",
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 8px rgba(249,115,22,0.3)",
      }}
    >
      <img src={logoUrl} alt="OptSolv Time Tracker" width={20} height={20} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    color: "var(--text)",
  },
  subtitle: {
    fontSize: 11,
    color: "var(--muted)",
  },
  infoBox: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "10px 12px",
    fontSize: 12,
    color: "var(--muted)",
    lineHeight: 1.6,
  },
  list: {
    paddingLeft: 16,
    marginTop: 6,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  input: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "7px 10px",
    color: "var(--text)",
    fontSize: 13,
    outline: "none",
    width: "100%",
  },
  errorBox: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "var(--radius)",
    padding: "8px 10px",
    color: "var(--red)",
    fontSize: 12,
  },
  button: {
    background: "var(--brand)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius)",
    padding: "9px 16px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    width: "100%",
    transition: "opacity 0.15s",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
};
