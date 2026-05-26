import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || 'Sofia <onboarding@resend.dev>';

function passwordResetHtml(resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Redefinir senha — Sofia</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">Zyreo <span style="color:#6366f1;">Sofia</span></span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a;">Redefinir sua senha</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${resetLink}"
                       style="display:inline-block;background:#6366f1;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.2px;">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;line-height:1.6;">
                Se você não solicitou a redefinição de senha, pode ignorar este e-mail com segurança. Sua senha não será alterada.
              </p>
              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                O link expira em <strong>1 hora</strong>.
              </p>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td style="padding:0 40px 32px;">
              <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">Link alternativo</p>
                <p style="margin:0;font-size:11px;color:#6366f1;word-break:break-all;">${resetLink}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Zyreo Sofia — Plataforma de Atendimento WhatsApp
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Redefinir senha — Zyreo Sofia',
    html: passwordResetHtml(resetLink),
  });

  if (error) {
    throw new Error(`[Email] Resend error: ${JSON.stringify(error)}`);
  }
}

function otpHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Código de acesso — Sofia</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:28px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">Zyreo <span style="color:#6366f1;">Sofia</span></span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;text-align:center;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Seu código de acesso</h1>
              <p style="margin:0 0 32px;font-size:14px;color:#64748b;line-height:1.6;">
                Use o código abaixo para entrar na plataforma.<br/>Ele expira em <strong>10 minutos</strong>.
              </p>

              <!-- OTP Code -->
              <div style="display:inline-block;background:#f1f5f9;border-radius:16px;padding:24px 48px;margin-bottom:28px;">
                <span style="font-size:44px;font-weight:900;letter-spacing:12px;color:#0f172a;font-family:'Courier New',monospace;">${code}</span>
              </div>

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
                Se você não solicitou esse código, ignore este e-mail.<br/>
                Sua conta permanece protegida.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Zyreo Sofia — Plataforma de Atendimento WhatsApp
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `${code} — Seu código de acesso Zyreo Sofia`,
    html: otpHtml(code),
  });

  if (error) {
    throw new Error(`[Email] Resend error: ${JSON.stringify(error)}`);
  }
}
