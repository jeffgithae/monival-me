import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST not set — email delivery disabled. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS to enable.');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port:   config.get<number>('SMTP_PORT', 587),
      secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: config.get<string>('SMTP_USER', ''),
        pass: config.get<string>('SMTP_PASS', ''),
      },
    });
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(options: MailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`Email not sent (SMTP not configured): ${options.subject}`);
      return false;
    }
    try {
      const from = this.config.get<string>('SMTP_FROM', '"Monival M&E" <noreply@monival.app>');
      await this.transporter.sendMail({ from, ...options });
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
    You are receiving this because you have a scheduled report configured in Monival.
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
}