import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const TEMPLATE_PASSWORD_RESET = process.env.RESEND_TEMPLATE_PASSWORD_RESET!;
const TEMPLATE_OTP = process.env.RESEND_TEMPLATE_OTP!;

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const { error } = await resend.emails.send({
    to,
    template: {
      id: TEMPLATE_PASSWORD_RESET,
      variables: { reset_link: resetLink },
    },
  } as any);

  if (error) {
    throw new Error(`[Email] Resend error: ${JSON.stringify(error)}`);
  }
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const { error } = await resend.emails.send({
    to,
    template: {
      id: TEMPLATE_OTP,
      variables: { otp_code: code },
    },
  } as any);

  if (error) {
    throw new Error(`[Email] Resend error: ${JSON.stringify(error)}`);
  }
}
