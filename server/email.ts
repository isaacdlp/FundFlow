import nodemailer from "nodemailer";
import { log } from "./index";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ionos.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: parseInt(process.env.SMTP_PORT || "465") === 465,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASSWORD || "",
  },
});

function getBaseUrl(): string {
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

export async function sendPasswordResetEmail(email: string, firstName: string, token: string): Promise<boolean> {
  const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

  try {
    await transporter.sendMail({
      from: `"FundFlow" <${fromAddress}>`,
      to: email,
      subject: "Reset Your Password - FundFlow",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Password Reset Request</h2>
          <p>Hi ${firstName},</p>
          <p>We received a request to reset your FundFlow account password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; padding: 12px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="color: #666; font-size: 12px; word-break: break-all;">${resetUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">FundFlow - Fund Management Platform</p>
        </div>
      `,
      text: `Hi ${firstName},\n\nWe received a request to reset your FundFlow account password.\n\nClick this link to set a new password: ${resetUrl}\n\nThis link will expire in 1 hour. If you didn't request this, you can safely ignore this email.\n\nFundFlow - Fund Management Platform`,
    });
    log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    log(`Failed to send password reset email to ${email}: ${(error as Error).message}`);
    return false;
  }
}
