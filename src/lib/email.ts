import { Resend } from "resend";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send invitation e-mails.");
  }

  return new Resend(apiKey);
}

export interface InvitationEmailData {
  to: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
  expiresInHours: number;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  member: "Membro",
};

export async function sendInvitationEmail(
  data: InvitationEmailData,
): Promise<void> {
  const resend = getResendClient();
  const roleLabel = roleLabels[data.role] ?? data.role;

  const { error } = await resend.emails.send({
    from:
      process.env.RESEND_FROM_EMAIL ?? "OptSolv Time <noreply@optsolv.com.br>",
    to: data.to,
    subject: `${data.inviterName} te convidou para o OptSolv Time`,
    html: buildInvitationEmailHtml({ ...data, roleLabel }),
  });

  if (error) {
    console.error(
      "[sendInvitationEmail] Resend error ao enviar para",
      data.to,
      JSON.stringify(error),
    );
    throw new Error(
      `Falha ao enviar e-mail de convite: ${error.message ?? JSON.stringify(error)}`,
    );
  }
}

function buildInvitationEmailHtml(
  data: InvitationEmailData & { roleLabel: string },
): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Convite OptSolv Time</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#141414;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;">
                    <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.5px;">OptSolv <span style="opacity:0.8;">Time</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 12px;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3;">
                Você foi convidado! 🎉
              </h1>
              <p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">
                <strong style="color:#e5e5e5;">${data.inviterName}</strong> (${data.inviterEmail}) te convidou para acessar o <strong style="color:#f97316;">OptSolv Time</strong> como <strong style="color:#e5e5e5;">${data.roleLabel}</strong>.
              </p>
              <p style="margin:0 0 32px;color:#a3a3a3;font-size:14px;line-height:1.6;">
                Clique no botão abaixo para criar sua conta e começar a usar a plataforma. O convite expira em <strong style="color:#e5e5e5;">${data.expiresInHours} horas</strong>.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                    <a href="${data.acceptUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Aceitar Convite →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Link fallback -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0;color:#525252;font-size:12px;line-height:1.5;">
                Ou copie e cole este link no seu navegador:<br/>
                <a href="${data.acceptUrl}" style="color:#f97316;word-break:break-all;">${data.acceptUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#525252;font-size:12px;">
                Se você não esperava este convite, pode ignorar este e-mail com segurança. Este convite é destinado a <strong style="color:#737373;">${data.to}</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
