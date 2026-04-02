import { Resend } from "resend";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send e-mails.");
  }
  return new Resend(apiKey);
}

// ─── Invitation Email ─────────────────────────────────────────────────

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

// ─── Release Notes Email ───────────────────────────────────────────────

export interface ReleaseEmailData {
  to: string;
  recipientName: string;
  versionTag: string;
  title: string;
  description: string;
  authorName: string;
  publishedAt: string;
  changelogUrl: string;
}

/**
 * Sends release notes to multiple recipients using Resend batch API.
 * Automatically splits into chunks of 100 (Resend limit).
 */
export async function sendReleaseNotesBatch(
  recipients: Array<{ email: string; name: string }>,
  release: {
    versionTag: string;
    title: string;
    description: string;
    authorName: string;
    publishedAt: string;
    changelogUrl: string;
  },
): Promise<{ sent: number; failed: number }> {
  const resend = getResendClient();
  const from =
    process.env.RESEND_FROM_EMAIL ?? "OptSolv Time <noreply@optsolv.com.br>";

  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emails = chunk.map((r) => ({
      from,
      to: r.email,
      subject: `🚀 OptSolv Time ${release.versionTag} — ${release.title}`,
      html: buildReleaseEmailHtml({
        to: r.email,
        recipientName: r.name,
        ...release,
      }),
    }));

    try {
      const { data: batchData, error } = await resend.batch.send(emails);
      if (error) {
        console.error(
          "[sendReleaseNotesBatch] Batch error:",
          JSON.stringify(error),
        );
        failed += chunk.length;
      } else {
        sent += batchData?.data?.length ?? chunk.length;
      }
    } catch (err) {
      console.error("[sendReleaseNotesBatch] Unexpected error:", err);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

function formatDescriptionToHtml(description: string): string {
  return description
    .replace(
      /^### (.+)$/gm,
      '<h3 style="margin:16px 0 6px;color:#e5e5e5;font-size:14px;font-weight:600;">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 style="margin:20px 0 8px;color:#ffffff;font-size:16px;font-weight:700;">$1</h2>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e5e5e5;">$1</strong>')
    .replace(
      /^- (.+)$/gm,
      '<li style="color:#a3a3a3;margin:4px 0;padding-left:4px;">$1</li>',
    )
    .replace(
      /(<li[^>]*>.*<\/li>\n?)+/g,
      (match) =>
        `<ul style="margin:8px 0 12px;padding-left:20px;list-style:disc;">${match}</ul>`,
    )
    .replace(
      /\n{2,}/g,
      '</p><p style="margin:0 0 12px;color:#a3a3a3;font-size:14px;line-height:1.7;">',
    )
    .replace(/\n/g, "<br/>");
}

// ─── Hours Reminder Email ─────────────────────────────────────────────────────

export interface HoursReminderEmailData {
  to: string;
  recipientName: string;
  period: string;
  condition: "all" | "not_submitted";
  senderName: string;
  personalNote?: string;
  timesheetUrl: string;
}

/**
 * Sends hours reminder emails to multiple recipients using Resend batch API.
 * Automatically splits into chunks of 100 (Resend limit).
 */
export async function sendHoursReminderBatch(
  recipients: Array<{ id: string; name: string; email: string }>,
  payload: {
    period: string;
    condition: "all" | "not_submitted";
    senderName: string;
    personalNote?: string;
    timesheetUrl: string;
  },
): Promise<{ sent: number; failed: number }> {
  const resend = getResendClient();
  const from =
    process.env.RESEND_FROM_EMAIL ??
    "OptSolv Time <noreply@optsolv.com.br>";

  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emails = chunk.map((r) => ({
      from,
      to: r.email,
      subject: `Lembrete: envie suas horas — ${payload.period}`,
      html: buildHoursReminderEmailHtml({
        to: r.email,
        recipientName: r.name,
        ...payload,
      }),
    }));

    try {
      const { data: batchData, error } = await resend.batch.send(emails);
      if (error) {
        console.error(
          "[sendHoursReminderBatch] Batch error:",
          JSON.stringify(error),
        );
        failed += chunk.length;
      } else {
        sent += batchData?.data?.length ?? chunk.length;
      }
    } catch (err) {
      console.error("[sendHoursReminderBatch] Unexpected error:", err);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

function buildHoursReminderEmailHtml(data: HoursReminderEmailData): string {
  const bodyText =
    data.condition === "not_submitted"
      ? `Identificamos que você ainda não enviou suas horas referentes à semana <strong style="color:#e5e5e5;">${data.period}</strong>.`
      : `Este é um lembrete para enviar suas horas referentes à semana <strong style="color:#e5e5e5;">${data.period}</strong>.`;

  const noteBlock = data.personalNote
    ? `
    <!-- Personal note -->
    <tr>
      <td style="padding:0 40px 24px;">
        <div style="background:#1e1a14;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;">
          <p style="margin:0 0 4px;color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Mensagem de ${data.senderName}</p>
          <p style="margin:0;color:#d4d4d4;font-size:14px;line-height:1.6;">${data.personalNote}</p>
        </div>
      </td>
    </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Lembrete de horas — OptSolv Time</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#141414;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 28px;background:linear-gradient(135deg,#f97316 0%,#c2410c 100%);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;">
                    <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.5px;">OptSolv <span style="opacity:0.8;">Time</span></span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:20px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.25;">&#9200; Lembrete de envio de horas</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">${data.period}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 20px;">
              <p style="margin:0 0 8px;color:#a3a3a3;font-size:14px;">Olá, <strong style="color:#e5e5e5;">${data.recipientName}</strong> &#128075;</p>
              <p style="margin:0;color:#a3a3a3;font-size:14px;line-height:1.7;">${bodyText}</p>
            </td>
          </tr>

          ${noteBlock}

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                    <a href="${data.timesheetUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Enviar minhas horas &#8594;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#525252;font-size:11px;line-height:1.6;">
                Enviado por <strong style="color:#737373;">${data.senderName}</strong> via <strong style="color:#737373;">OptSolv Time</strong>.
                Este e-mail foi enviado para <strong style="color:#737373;">${data.to}</strong>.
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

function buildReleaseEmailHtml(data: ReleaseEmailData): string {
  const formattedDate = new Date(data.publishedAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const descriptionHtml = formatDescriptionToHtml(data.description);

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>OptSolv Time ${data.versionTag} — ${data.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#141414;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:600px;width:100%;">

          <!-- Header gradient -->
          <tr>
            <td style="padding:32px 40px 28px;background:linear-gradient(135deg,#f97316 0%,#c2410c 100%);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;">
                          <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.5px;">OptSolv <span style="opacity:0.8;">Time</span></span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:rgba(0,0,0,0.2);border-radius:20px;padding:5px 12px;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.3px;">${data.versionTag}</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:20px 0 0;color:#ffffff;font-size:26px;font-weight:800;line-height:1.25;letter-spacing:-0.5px;">🚀 Nova versão disponível</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:15px;">${data.title}</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 4px;color:#a3a3a3;font-size:14px;">Olá, <strong style="color:#e5e5e5;">${data.recipientName}</strong> 👋</p>
              <p style="margin:0 0 20px;color:#a3a3a3;font-size:14px;line-height:1.6;">
                O <strong style="color:#f97316;">OptSolv Time</strong> acaba de receber uma nova atualização. Veja as novidades desta versão abaixo:
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:linear-gradient(90deg,rgba(249,115,22,0.5) 0%,rgba(249,115,22,0.05) 100%);"></div>
            </td>
          </tr>

          <!-- Release notes body -->
          <tr>
            <td style="padding:24px 40px 8px;">
              <div style="background:#1a1a1a;border-radius:12px;border:1px solid rgba(255,255,255,0.06);padding:24px;">
                <p style="margin:0 0 12px;color:#a3a3a3;font-size:14px;line-height:1.7;">${descriptionHtml}</p>
              </div>
            </td>
          </tr>

          <!-- Meta info row -->
          <tr>
            <td style="padding:16px 40px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;">
                    <span style="color:#525252;font-size:12px;">📅 Publicado em </span>
                    <span style="color:#737373;font-size:12px;font-weight:500;">${formattedDate}</span>
                  </td>
                  <td align="right" style="padding:4px 0;">
                    <span style="color:#525252;font-size:12px;">por </span>
                    <span style="color:#737373;font-size:12px;font-weight:500;">${data.authorName}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                    <a href="${data.changelogUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Ver changelog completo →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#525252;font-size:11px;line-height:1.6;">
                Você está recebendo este e-mail porque é um usuário ativo do <strong style="color:#737373;">OptSolv Time</strong>.
                Este e-mail foi enviado para <strong style="color:#737373;">${data.to}</strong>.
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
