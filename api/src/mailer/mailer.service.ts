import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('RESEND_KEY') || config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_KEY not set — email delivery disabled. Set RESEND_KEY to enable.');
      return;
    }
    this.resend = new Resend(apiKey);
  }

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  async send(options: MailOptions): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`Email not sent (Resend not configured): ${options.subject}`);
      return false;
    }
    try {
      const from = this.config.get<string>('SMTP_FROM', '"Evidara M&E" <noreply@evidara.app>');
      const { error } = await this.resend.emails.send({
        from,
        to: options.to as string | string[],
        subject: options.subject,
        html: options.html,
        text: options.text || '',
        attachments: options.attachments,
      });

      if (error) {
        this.logger.error('Resend email failed', error);
        return false;
      }
      this.logger.log(`Email sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}: ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error('Email send failed', err);
      return false;
    }
  }

  /** Render a simple HTML report email */
  reportEmail(opts: {
    orgName: string;
    projectName: string;
    periodName: string;
    reportUrl: string;
    recipientName: string;
    csvAttachment?: Buffer;
  }): Pick<MailOptions, 'html' | 'text' | 'attachments'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .header p { margin: 0; opacity: .85; font-size: .9rem; }
  .body { padding: 32px; }
  .meta { background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: .9rem; }
  .meta dt { font-weight: 600; color: #374151; }
  .meta dd { margin: 2px 0 12px 0; color: #6b7280; }
  .btn { display: inline-block; background: #4f46e5; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>📊 Scheduled Report Ready</h1>
    <p>${opts.orgName}</p>
  </div>
  <div class="body">
    <p>Hi ${opts.recipientName},</p>
    <p>Your scheduled donor report has been generated for the following period:</p>
    <dl class="meta">
      <dt>Project</dt><dd>${opts.projectName}</dd>
      <dt>Reporting period</dt><dd>${opts.periodName}</dd>
      <dt>Generated</dt><dd>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
    </dl>
    <p>${opts.csvAttachment ? 'A CSV export is attached to this email.' : 'Open the report on the platform to view full details.'}</p>
    <a href="${opts.reportUrl}" class="btn">View Report →</a>
  </div>
  <div class="footer">
    You are receiving this because you have a scheduled report configured in Evidara .
    <a href="${opts.reportUrl}/settings">Manage notification preferences</a>
  </div>
</div>
</body>
</html>`;

    const attachments = opts.csvAttachment
      ? [{ filename: `report-${opts.periodName.replace(/\s+/g, '-')}.csv`, content: opts.csvAttachment, contentType: 'text/csv' }]
      : undefined;

    return {
      html,
      text: `Scheduled Report: ${opts.projectName} — ${opts.periodName}\n\nView at: ${opts.reportUrl}`,
      attachments,
    };
  }

  /** Render an onboarding email */
  onboardingEmail(opts: {
    name: string;
    appUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #4f46e5; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Welcome to Evidara! 🎉</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>We're thrilled to have you on board. Evidara helps you manage your projects, track budgets, and measure impact all in one place.</p>
    <p>To get started, log in to your dashboard:</p>
    <a href="${opts.appUrl}" class="btn">Go to Dashboard →</a>
    <p>If you have any questions, simply reply to this email.</p>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Welcome to Evidara, ${opts.name}!\n\nGet started by logging in: ${opts.appUrl}`,
    };
  }

  /** Render an invite email */
  inviteEmail(opts: {
    inviteeName: string;
    inviterName: string;
    orgName: string;
    inviteUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #4f46e5; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>You've been invited!</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.inviteeName},</p>
    <p><strong>${opts.inviterName}</strong> has invited you to join their team on <strong>${opts.orgName}</strong> using Evidara.</p>
    <p>Click the button below to accept the invitation and set up your account:</p>
    <a href="${opts.inviteUrl}" class="btn">Accept Invitation</a>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `${opts.inviterName} invited you to join ${opts.orgName} on Evidara.\n\nAccept invitation: ${opts.inviteUrl}`,
    };
  }

  /** Render a payment reminder email */
  paymentReminderEmail(opts: {
    name: string;
    amount: string;
    dueDate: string;
    paymentUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #f59e0b, #ea580c); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #ea580c; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Payment Reminder</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>This is a friendly reminder that your upcoming payment of <strong>${opts.amount}</strong> is due on <strong>${opts.dueDate}</strong>.</p>
    <p>To avoid any interruption in service, please complete your payment by clicking the button below:</p>
    <a href="${opts.paymentUrl}" class="btn">Pay Now</a>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Reminder: Payment of ${opts.amount} is due on ${opts.dueDate}.\n\nPay here: ${opts.paymentUrl}`,
    };
  }

  /** Render an invoice email */
  invoiceEmail(opts: {
    name: string;
    amount: string;
    invoiceNumber: string;
    downloadUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #10b981, #059669); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #059669; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Your Invoice is Available</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>Thank you for your business. Your invoice <strong>#${opts.invoiceNumber}</strong> for <strong>${opts.amount}</strong> is now available.</p>
    <p>You can download a copy of your invoice by clicking the button below:</p>
    <a href="${opts.downloadUrl}" class="btn">Download Invoice</a>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Invoice #${opts.invoiceNumber} for ${opts.amount} is available.\n\nDownload here: ${opts.downloadUrl}`,
    };
  }

  /** Render a password reset email */
  passwordResetEmail(opts: {
    name: string;
    resetUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #b91c1c; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Password Reset Request</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>We received a request to reset the password for your Evidara account. If you made this request, please click the button below to set a new password:</p>
    <a href="${opts.resetUrl}" class="btn">Reset Password</a>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Password reset request for your Evidara account.\n\nReset your password here: ${opts.resetUrl}`,
    };
  }

  /** Render a password reset success email */
  passwordResetSuccessEmail(opts: {
    name: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #10b981, #059669); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Password Changed Successfully</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>Your password has been successfully updated. You can now log in to your account with your new password.</p>
    <p>If you did not make this change, please contact support immediately.</p>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Your Evidara password has been changed successfully.`,
    };
  }

  /** Render a role updated email */
  roleUpdatedEmail(opts: {
    name: string;
    orgName: string;
    newRole: string;
    appUrl: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #3b82f6, #2563eb); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .btn { display: inline-block; background: #2563eb; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Role Updated</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>Your role in the organization <strong>${opts.orgName}</strong> has been updated to <strong>${opts.newRole}</strong>.</p>
    <a href="${opts.appUrl}" class="btn">Go to Dashboard</a>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Your role in ${opts.orgName} has been updated to ${opts.newRole}.`,
    };
  }

  /** Render a member removed email */
  memberRemovedEmail(opts: {
    name: string;
    orgName: string;
  }): Pick<MailOptions, 'html' | 'text'> {
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #6b7280, #4b5563); padding: 32px; color: #fff; }
  .header h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .body { padding: 32px; }
  .footer { border-top: 1px solid #e5e7eb; padding: 20px 32px; font-size: .8rem; color: #9ca3af; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Access Revoked</h1>
  </div>
  <div class="body">
    <p>Hi ${opts.name},</p>
    <p>Your access to the organization <strong>${opts.orgName}</strong> has been revoked by an administrator.</p>
    <p>If you believe this was a mistake, please contact your organization administrator.</p>
  </div>
  <div class="footer">
    © ${new Date().getFullYear()} Evidara. All rights reserved.
  </div>
</div>
</body>
</html>`;
    return {
      html,
      text: `Your access to ${opts.orgName} has been revoked.`,
    };
  }
}