import { auth } from "@/lib/auth";
import { getSmtpConfigFromDb, sendTestSmtpEmail } from "@/lib/email";
import { testSmtpSchema } from "@/lib/validations/email-settings.schema";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return Response.json(
      { error: "Apenas administradores podem testar configurações de e-mail." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = testSmtpSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  let passToUse = data.pass;

  // If password was masked or omitted, load existing decrypted password from DB
  if (!passToUse || passToUse === "••••••••") {
    const savedConfig = await getSmtpConfigFromDb();
    if (!savedConfig?.pass) {
      return Response.json(
        { error: "Por favor, digite a Senha de App para realizar o teste." },
        { status: 400 },
      );
    }
    passToUse = savedConfig.pass;
  }

  const recipientEmail = data.testRecipient || session.user.email;
  if (!recipientEmail) {
    return Response.json(
      { error: "E-mail de destino não especificado." },
      { status: 400 },
    );
  }

  try {
    await sendTestSmtpEmail(
      {
        host: data.host,
        port: data.port,
        secure: data.secure,
        user: data.user,
        pass: passToUse,
        fromEmail: data.fromEmail,
      },
      recipientEmail,
    );

    return Response.json({
      success: true,
      message: `E-mail de teste enviado com sucesso para ${recipientEmail}!`,
    });
  } catch (err: unknown) {
    console.error("[POST /api/admin/settings/email/test]", err);
    const errorMessage =
      err instanceof Error ? err.message : "Falha ao conectar ou enviar e-mail via SMTP.";
    return Response.json(
      { error: `Erro no teste de e-mail: ${errorMessage}` },
      { status: 400 },
    );
  }
}
