import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { systemSetting } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
}

export const SMTP_CONFIG_KEY = "smtp_config";

/**
 * Loads and decrypts SMTP configuration from database if present.
 */
export async function getSmtpConfigFromDb(): Promise<SmtpConfig | null> {
  try {
    const result = await db
      .select()
      .from(systemSetting)
      .where(eq(systemSetting.key, SMTP_CONFIG_KEY))
      .limit(1);

    if (!result[0]?.value) return null;

    const parsed = JSON.parse(result[0].value);
    if (!parsed.host || !parsed.user || !parsed.pass) return null;

    return {
      host: parsed.host,
      port: Number(parsed.port) || 587,
      secure: Boolean(parsed.secure ?? parsed.port === 465),
      user: parsed.user,
      pass: decrypt(parsed.pass),
      fromEmail: parsed.fromEmail || `OptSolv Time <${parsed.user}>`,
    };
  } catch (err) {
    console.error("[getSmtpConfigFromDb] Error loading SMTP config:", err);
    return null;
  }
}

interface SingleEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface BatchEmailOptions {
  emails: Array<{
    to: string;
    subject: string;
    html: string;
  }>;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeFromEmail(
  fromEmail: string,
  user: string,
  host: string,
): string {
  if (host.includes("gmail.com")) {
    const displayNameMatch = fromEmail.match(/^(.*?)</);
    const displayName = displayNameMatch
      ? displayNameMatch[1].trim()
      : "OptSolv Time";
    return `${displayName} <${user}>`;
  }
  return fromEmail || `OptSolv Time <${user}>`;
}

/**
 * Core email sender for a single email. Uses DB SMTP if available, or falls back to Resend.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SingleEmailOptions): Promise<void> {
  const smtp = await getSmtpConfigFromDb();

  if (smtp) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    const from = sanitizeFromEmail(smtp.fromEmail, smtp.user, smtp.host);

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: stripHtmlToText(html),
      headers: {
        "X-Mailer": "OptSolv Time",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
      },
    });
    return;
  }

  // Fallback: Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Nenhum serviço de e-mail configurado. Por favor, defina as configurações de SMTP no painel administrativo ou RESEND_API_KEY.",
    );
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL ?? "OptSolv Time <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[sendEmail] Resend error:", JSON.stringify(error));
    throw new Error(
      `Falha ao enviar e-mail via Resend: ${error.message ?? JSON.stringify(error)}`,
    );
  }
}

/**
 * Core batch email sender. Uses DB SMTP if available, or falls back to Resend batch API.
 */
export async function sendBatchEmails({
  emails,
}: BatchEmailOptions): Promise<{ sent: number; failed: number }> {
  if (emails.length === 0) return { sent: 0, failed: 0 };

  const smtp = await getSmtpConfigFromDb();

  if (smtp) {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    const from = sanitizeFromEmail(smtp.fromEmail, smtp.user, smtp.host);
    let sent = 0;
    let failed = 0;

    for (const item of emails) {
      try {
        await transporter.sendMail({
          from,
          to: item.to,
          subject: item.subject,
          html: item.html,
          text: stripHtmlToText(item.html),
          headers: {
            "X-Mailer": "OptSolv Time",
            "X-Auto-Response-Suppress": "OOF, AutoReply",
          },
        });
        sent++;
      } catch (err) {
        console.error(
          `[sendBatchEmails] SMTP error sending to ${item.to}:`,
          err,
        );
        failed++;
      }
    }

    return { sent, failed };
  }

  // Fallback: Resend Batch API
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Nenhum serviço de e-mail configurado. Por favor, defina as configurações de SMTP no painel administrativo ou RESEND_API_KEY.",
    );
  }

  const resend = new Resend(apiKey);
  const from =
    process.env.RESEND_FROM_EMAIL ?? "OptSolv Time <onboarding@resend.dev>";

  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const resendEmails = chunk.map((e) => ({
      from,
      to: e.to,
      subject: e.subject,
      html: e.html,
    }));

    try {
      const { data: batchData, error } = await resend.batch.send(resendEmails);
      if (error) {
        console.error(
          "[sendBatchEmails] Resend batch error:",
          JSON.stringify(error),
        );
        failed += chunk.length;
      } else {
        sent += batchData?.data?.length ?? chunk.length;
      }
    } catch (err) {
      console.error("[sendBatchEmails] Resend unexpected error:", err);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

/**
 * Tests an arbitrary SMTP configuration.
 */
export async function sendTestSmtpEmail(
  config: SmtpConfig,
  recipientEmail: string,
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.verify();

  const from = sanitizeFromEmail(config.fromEmail, config.user, config.host);
  const testHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><title>Teste SMTP</title></head>
<body style="margin:0;padding:24px;background-color:#0a0a0a;font-family:'Segoe UI',sans-serif;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;background:#141414;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:32px;">
    <div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:8px 14px;border-radius:8px;display:inline-block;margin-bottom:20px;">
      <span style="color:#ffffff;font-weight:700;font-size:14px;">OptSolv Time</span>
    </div>
    <h2 style="margin:0 0 12px;color:#ffffff;font-size:20px;">Conexão SMTP Estabelecida! 🎉</h2>
    <p style="margin:0 0 16px;color:#a3a3a3;font-size:14px;line-height:1.6;">
      Este e-mail confirma que as configurações do servidor <strong>${config.host}</strong> (${config.user}) estão corretas e o envio está 100% operacional.
    </p>
    <div style="background:#1e1e1e;border-radius:8px;padding:12px 16px;font-size:12px;color:#737373;">
      Remetente: <strong style="color:#e5e5e5;">${from}</strong><br/>
      Destinatário: <strong style="color:#e5e5e5;">${recipientEmail}</strong>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from,
    to: recipientEmail,
    subject: "✨ E-mail de Teste — OptSolv Time",
    html: testHtml,
    text: stripHtmlToText(testHtml),
    headers: {
      "X-Mailer": "OptSolv Time",
      "X-Auto-Response-Suppress": "OOF, AutoReply",
    },
  });
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
  const roleLabel = roleLabels[data.role] ?? data.role;
  await sendEmail({
    to: data.to,
    subject: `${data.inviterName} te convidou para o OptSolv Time`,
    html: buildInvitationEmailHtml({ ...data, roleLabel }),
  });
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
  const emails = recipients.map((r) => ({
    to: r.email,
    subject: `🚀 OptSolv Time ${release.versionTag} — ${release.title}`,
    html: buildReleaseEmailHtml({
      to: r.email,
      recipientName: r.name,
      ...release,
    }),
  }));

  return sendBatchEmails({ emails });
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
  const emails = recipients.map((r) => ({
    to: r.email,
    subject: `Lembrete: envie suas horas — ${payload.period}`,
    html: buildHoursReminderEmailHtml({
      to: r.email,
      recipientName: r.name,
      ...payload,
    }),
  }));

  return sendBatchEmails({ emails });
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

// ─── AI Operator Notification Email ───────────────────────────────────────────

/**
 * Subject, message and context lines are authored by a person (or drafted by
 * the assistant from their command), so they are escaped before reaching HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface OperatorNotificationEmailData {
  to: string;
  recipientName: string;
  subject: string;
  message: string;
  contextLines: string[];
  senderName: string;
  projectName: string | null;
  appUrl: string;
}

/**
 * Sends an operator-triggered notification (e.g. a budget alert) to the
 * recipients the sender explicitly confirmed.
 */
export async function sendOperatorNotificationBatch(
  recipients: Array<{ id: string; name: string; email: string }>,
  payload: {
    subject: string;
    message: string;
    contextLines: string[];
    senderName: string;
    projectName: string | null;
    appUrl: string;
  },
): Promise<{ sent: number; failed: number }> {
  const emails = recipients.map((recipient) => ({
    to: recipient.email,
    subject: payload.subject,
    html: buildOperatorNotificationHtml({
      to: recipient.email,
      recipientName: recipient.name,
      ...payload,
    }),
  }));

  return sendBatchEmails({ emails });
}

function buildOperatorNotificationHtml(
  data: OperatorNotificationEmailData,
): string {
  const safeSubject = escapeHtml(data.subject);
  const safeSender = escapeHtml(data.senderName);
  const safeProject = data.projectName ? escapeHtml(data.projectName) : null;
  const messageHtml = escapeHtml(data.message).replace(/\n/g, "<br/>");

  const contextBlock =
    data.contextLines.length > 0
      ? `
    <tr>
      <td style="padding:0 40px 24px;">
        <div style="background:#1e1a14;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;">
          <p style="margin:0 0 8px;color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Contexto</p>
          ${data.contextLines
            .map(
              (line) =>
                `<p style="margin:0 0 4px;color:#d4d4d4;font-size:13px;line-height:1.6;">${escapeHtml(line)}</p>`,
            )
            .join("")}
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
  <title>${safeSubject} — OptSolv Time</title>
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
              <h1 style="margin:20px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.25;">${safeSubject}</h1>
              ${safeProject ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">${safeProject}</p>` : ""}
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:32px 40px 20px;">
              <p style="margin:0 0 8px;color:#a3a3a3;font-size:14px;">Olá, <strong style="color:#e5e5e5;">${escapeHtml(data.recipientName)}</strong> &#128075;</p>
              <p style="margin:0;color:#a3a3a3;font-size:14px;line-height:1.7;">${messageHtml}</p>
            </td>
          </tr>

          ${contextBlock}

          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:10px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                    <a href="${data.appUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                      Abrir o OptSolv Time &#8594;
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
                Enviado por <strong style="color:#737373;">${safeSender}</strong> via <strong style="color:#737373;">OptSolv Time</strong>.
                Este e-mail foi enviado para <strong style="color:#737373;">${escapeHtml(data.to)}</strong>.
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
