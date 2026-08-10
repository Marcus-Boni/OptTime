import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { systemSetting } from "@/lib/db/schema";
import { SMTP_CONFIG_KEY } from "@/lib/email";
import { encrypt } from "@/lib/encryption";
import { smtpConfigSchema } from "@/lib/validations/email-settings.schema";

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return Response.json(
      { error: "Apenas administradores podem acessar estas configurações." },
      { status: 403 },
    );
  }

  try {
    const result = await db
      .select()
      .from(systemSetting)
      .where(eq(systemSetting.key, SMTP_CONFIG_KEY))
      .limit(1);

    if (!result[0]?.value) {
      return Response.json({
        configured: false,
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        user: "",
        fromEmail: "OptSolv Time <optsolv.time@gmail.com>",
        pass: "",
      });
    }

    const parsed = JSON.parse(result[0].value);
    return Response.json({
      configured: true,
      host: parsed.host || "smtp.gmail.com",
      port: parsed.port || 587,
      secure: Boolean(parsed.secure),
      user: parsed.user || "",
      fromEmail: parsed.fromEmail || "",
      pass: "••••••••", // Masked password for UI security
    });
  } catch (err) {
    console.error("[GET /api/admin/settings/email]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return Response.json(
      {
        error: "Apenas administradores podem alterar configurações de e-mail.",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = smtpConfigSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const encryptedPass = encrypt(parsed.data.pass);
    const valueToSave = JSON.stringify({
      ...parsed.data,
      pass: encryptedPass,
    });

    await db
      .insert(systemSetting)
      .values({
        key: SMTP_CONFIG_KEY,
        value: valueToSave,
        updatedById: session.user.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSetting.key,
        set: {
          value: valueToSave,
          updatedById: session.user.id,
          updatedAt: new Date(),
        },
      });

    return Response.json({
      success: true,
      message: "Configurações de e-mail salvas com sucesso!",
    });
  } catch (err) {
    console.error("[POST /api/admin/settings/email]", err);
    return Response.json(
      { error: "Erro interno ao salvar configurações" },
      { status: 500 },
    );
  }
}
