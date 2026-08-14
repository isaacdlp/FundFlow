import nodemailer from "nodemailer";
import { log } from "./index";
import { RESET_PASSWORD_PATHS, type Locale as Lang } from "@shared/i18n";

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
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  }
  return `http://localhost:${process.env.PORT || 5000}`;
}

function normalizeLang(language?: string): Lang {
  if (language === "es" || language === "fr") return language;
  return "en";
}

// ─── Welcome email translations ───────────────────────────────────────────────

const welcomeStrings: Record<Lang, {
  subject: string;
  heading: string;
  greeting: (name: string) => string;
  intro: string;
  usernameLabel: string;
  passwordLabel: string;
  cta: string;
  btnLabel: string;
  fallback: string;
  footer: string;
  textBody: (firstName: string, email: string, password: string, url: string) => string;
}> = {
  en: {
    subject: "Welcome to FundFlow – Your Account Details",
    heading: "Welcome to FundFlow",
    greeting: (name) => `Hi ${name},`,
    intro: "Your FundFlow account is ready. Use the credentials below to sign in:",
    usernameLabel: "Username&nbsp;(Email):",
    passwordLabel: "Password:",
    cta: "Click the button below to sign in to the platform:",
    btnLabel: "Sign In to FundFlow",
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footer: "FundFlow - Fund Management Platform",
    textBody: (firstName, email, password, url) =>
      `Hi ${firstName},\n\nYour FundFlow account is ready.\n\nUsername (Email): ${email}\nPassword: ${password}\n\nSign in at: ${url}\n\nFundFlow - Fund Management Platform`,
  },
  es: {
    subject: "Bienvenido a FundFlow – Datos de tu cuenta",
    heading: "Bienvenido a FundFlow",
    greeting: (name) => `Hola ${name},`,
    intro: "Tu cuenta en FundFlow está lista. Usa las credenciales a continuación para iniciar sesión:",
    usernameLabel: "Usuario&nbsp;(Email):",
    passwordLabel: "Contraseña:",
    cta: "Haz clic en el botón de abajo para acceder a la plataforma:",
    btnLabel: "Iniciar sesión en FundFlow",
    fallback: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
    footer: "FundFlow - Plataforma de Gestión de Fondos",
    textBody: (firstName, email, password, url) =>
      `Hola ${firstName},\n\nTu cuenta en FundFlow está lista.\n\nUsuario (Email): ${email}\nContraseña: ${password}\n\nInicia sesión en: ${url}\n\nFundFlow - Plataforma de Gestión de Fondos`,
  },
  fr: {
    subject: "Bienvenue sur FundFlow – Détails de votre compte",
    heading: "Bienvenue sur FundFlow",
    greeting: (name) => `Bonjour ${name},`,
    intro: "Votre compte FundFlow est prêt. Utilisez les identifiants ci-dessous pour vous connecter :",
    usernameLabel: "Identifiant&nbsp;(Email)&nbsp;:",
    passwordLabel: "Mot de passe&nbsp;:",
    cta: "Cliquez sur le bouton ci-dessous pour accéder à la plateforme :",
    btnLabel: "Se connecter à FundFlow",
    fallback: "Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :",
    footer: "FundFlow - Plateforme de Gestion de Fonds",
    textBody: (firstName, email, password, url) =>
      `Bonjour ${firstName},\n\nVotre compte FundFlow est prêt.\n\nIdentifiant (Email) : ${email}\nMot de passe : ${password}\n\nConnectez-vous sur : ${url}\n\nFundFlow - Plateforme de Gestion de Fonds`,
  },
};

// ─── Password reset translations ──────────────────────────────────────────────

const resetStrings: Record<Lang, {
  subject: string;
  heading: string;
  greeting: (name: string) => string;
  intro: string;
  btnLabel: string;
  expiry: string;
  fallback: string;
  footer: string;
  textBody: (firstName: string, url: string) => string;
}> = {
  en: {
    subject: "Reset Your Password - FundFlow",
    heading: "Password Reset Request",
    greeting: (name) => `Hi ${name},`,
    intro: "We received a request to reset your FundFlow account password. Click the button below to set a new password:",
    btnLabel: "Reset Password",
    expiry: "This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
    fallback: "If the button doesn't work, copy and paste this URL into your browser:",
    footer: "FundFlow - Fund Management Platform",
    textBody: (firstName, url) =>
      `Hi ${firstName},\n\nWe received a request to reset your FundFlow account password.\n\nClick this link to set a new password: ${url}\n\nThis link will expire in 1 hour. If you didn't request this, you can safely ignore this email.\n\nFundFlow - Fund Management Platform`,
  },
  es: {
    subject: "Restablecer tu contraseña - FundFlow",
    heading: "Solicitud de restablecimiento de contraseña",
    greeting: (name) => `Hola ${name},`,
    intro: "Recibimos una solicitud para restablecer la contraseña de tu cuenta en FundFlow. Haz clic en el botón de abajo para establecer una nueva contraseña:",
    btnLabel: "Restablecer contraseña",
    expiry: "Este enlace caducará en 1 hora. Si no solicitaste el restablecimiento de contraseña, puedes ignorar este correo.",
    fallback: "Si el botón no funciona, copia y pega esta URL en tu navegador:",
    footer: "FundFlow - Plataforma de Gestión de Fondos",
    textBody: (firstName, url) =>
      `Hola ${firstName},\n\nRecibimos una solicitud para restablecer la contraseña de tu cuenta en FundFlow.\n\nHaz clic en este enlace para establecer una nueva contraseña: ${url}\n\nEste enlace caducará en 1 hora. Si no solicitaste esto, puedes ignorar este correo.\n\nFundFlow - Plataforma de Gestión de Fondos`,
  },
  fr: {
    subject: "Réinitialisation de votre mot de passe - FundFlow",
    heading: "Demande de réinitialisation du mot de passe",
    greeting: (name) => `Bonjour ${name},`,
    intro: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte FundFlow. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :",
    btnLabel: "Réinitialiser le mot de passe",
    expiry: "Ce lien expirera dans 1 heure. Si vous n'avez pas demandé de réinitialisation, vous pouvez ignorer cet e-mail.",
    fallback: "Si le bouton ne fonctionne pas, copiez et collez cette URL dans votre navigateur :",
    footer: "FundFlow - Plateforme de Gestion de Fonds",
    textBody: (firstName, url) =>
      `Bonjour ${firstName},\n\nNous avons reçu une demande de réinitialisation du mot de passe de votre compte FundFlow.\n\nCliquez sur ce lien pour définir un nouveau mot de passe : ${url}\n\nCe lien expirera dans 1 heure. Si vous n'avez pas demandé cela, vous pouvez ignorer cet e-mail.\n\nFundFlow - Plateforme de Gestion de Fonds`,
  },
};

// ─── Exported functions ────────────────────────────────────────────────────────

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  password: string,
  language?: string,
): Promise<boolean> {
  const lang = normalizeLang(language);
  const s = welcomeStrings[lang];
  const loginUrl = getBaseUrl();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

  try {
    await transporter.sendMail({
      from: `"FundFlow" <${fromAddress}>`,
      to: email,
      subject: s.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">${s.heading}</h2>
          <p>${s.greeting(firstName)}</p>
          <p>${s.intro}</p>
          <div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>${s.usernameLabel}</strong>&nbsp;${email}</p>
            <p style="margin: 0; font-size: 14px;"><strong>${s.passwordLabel}</strong>&nbsp;${password}</p>
          </div>
          <p>${s.cta}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}"
               style="display: inline-block; padding: 12px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              ${s.btnLabel}
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">${s.fallback}</p>
          <p style="color: #666; font-size: 12px; word-break: break-all;">${loginUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">${s.footer}</p>
        </div>
      `,
      text: s.textBody(firstName, email, password, loginUrl),
    });
    log(`Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    log(`Failed to send welcome email to ${email}: ${(error as Error).message}`);
    return false;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  firstName: string,
  token: string,
  language?: string,
): Promise<boolean> {
  const lang = normalizeLang(language);
  const s = resetStrings[lang];
  const resetUrl = `${getBaseUrl()}/${lang}${RESET_PASSWORD_PATHS[lang]}?token=${token}`;
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com";

  try {
    await transporter.sendMail({
      from: `"FundFlow" <${fromAddress}>`,
      to: email,
      subject: s.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">${s.heading}</h2>
          <p>${s.greeting(firstName)}</p>
          <p>${s.intro}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
               style="display: inline-block; padding: 12px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              ${s.btnLabel}
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">${s.expiry}</p>
          <p style="color: #666; font-size: 14px;">${s.fallback}</p>
          <p style="color: #666; font-size: 12px; word-break: break-all;">${resetUrl}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">${s.footer}</p>
        </div>
      `,
      text: s.textBody(firstName, resetUrl),
    });
    log(`Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    log(`Failed to send password reset email to ${email}: ${(error as Error).message}`);
    return false;
  }
}
