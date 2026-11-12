const crypto = require('node:crypto');
const EmailDelivery = require('../models/EmailDelivery');
const { buildJudgeInvitationEmail, buildResultReportEmail } = require('./emailTemplates');

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function getBrevoConfig() {
  return {
    apiKey: (process.env.BREVO_API_KEY || '').trim(),
    senderEmail: (process.env.BREVO_SENDER_EMAIL || '').trim(),
    senderName: (process.env.BREVO_SENDER_NAME || 'ScoreFlow').replace(/[\r\n\u0000-\u001f\u007f]/g, '').trim().slice(0, 100),
    clientUrl: (process.env.CLIENT_URL || '').trim(),
  };
}

function publicClientUrl(value, allowLocalhost = process.env.NODE_ENV !== 'production') {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    const localDevelopmentUrl = allowLocalhost && localHost && url.protocol === 'http:'
      && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
    const publicHttpsUrl = url.protocol === 'https:' && !localHost;
    return (localDevelopmentUrl || publicHttpsUrl) && !url.username && !url.password
      ? url.toString().replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

function isSmtpCredential(apiKey) { return apiKey.toLowerCase().startsWith('xsmtpsib-'); }

function safeRecipient(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeProviderEvent(payload) {
  const name = String(payload?.event || '').trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_');
  const statusByEvent = {
    request: 'accepted', sent: 'sent', delivered: 'delivered', deferred: 'deferred',
    soft_bounce: 'soft_bounced', hard_bounce: 'hard_bounced', blocked: 'blocked', spam: 'spam',
    invalid: 'invalid', invalid_email: 'invalid', unsubscribed: 'unsubscribed', error: 'failed',
  };
  return statusByEvent[name] ? { event: name, status: statusByEvent[name] } : null;
}

function createEmailService({ DeliveryModel = EmailDelivery, fetchImpl = (...args) => global.fetch(...args), configProvider = getBrevoConfig, logger = console } = {}) {
  async function sendTransactionalEmail({ category, recipientEmail, recipientName, subject, htmlContent, textContent, eventId = null, contextId = '', referenceId = '', requirePublicClientUrl = false }) {
    const { apiKey, senderEmail, senderName, clientUrl } = configProvider();
    const recipient = safeRecipient(recipientEmail);
    const safeSubject = String(subject || '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    if (!recipient) return { accepted: false, status: 'failed', code: 'invalid_recipient', message: 'The recipient email address is invalid.' };
    if (!safeSubject || typeof htmlContent !== 'string' || !htmlContent || typeof textContent !== 'string' || !textContent) {
      return { accepted: false, status: 'failed', code: 'invalid_message', message: 'The email subject and message content are required.' };
    }
    if (isSmtpCredential(apiKey)) return { accepted: false, status: 'failed', code: 'invalid_configuration', message: 'Brevo is configured with an SMTP key. Set BREVO_API_KEY to a Brevo API v3 key.' };
    if (!apiKey || !senderEmail || !EMAIL_PATTERN.test(senderEmail)) {
      return { accepted: false, status: 'failed', code: 'not_configured', message: 'Brevo email needs a valid API v3 key and verified sender email.' };
    }
    const publicUrl = requirePublicClientUrl ? publicClientUrl(clientUrl) : '';
    if (requirePublicClientUrl && !publicUrl) {
      return { accepted: false, status: 'failed', code: 'public_client_url_required', message: 'Judge invitation email requires CLIENT_URL to be a public HTTPS frontend URL.' };
    }

    try {
      const suppressed = await DeliveryModel.findOne({
        recipientEmail: recipient.toLowerCase(), status: { $in: ['hard_bounced', 'blocked', 'spam', 'invalid', 'unsubscribed'] },
      }).select('_id status');
      if (suppressed) return { accepted: false, status: 'suppressed', code: 'recipient_suppressed', message: 'This address is suppressed after a previous bounce or provider block.' };
    } catch (error) {
      logger.error('Email suppression lookup failed; message was not submitted to Brevo:', error.message);
      return { accepted: false, status: 'failed', code: 'tracking_unavailable', message: 'Email suppression status is unavailable; the email was not sent.' };
    }

    const trackingId = crypto.randomUUID();
    let delivery;
    try {
      delivery = await DeliveryModel.create({
        trackingId, category, eventId: eventId || null, contextId: String(contextId || ''), referenceId: String(referenceId || ''), recipientEmail: recipient,
        subject: safeSubject, status: 'sending',
      });
    } catch (error) {
      logger.error('Email delivery tracking could not be saved; message was not submitted to Brevo:', error.message);
      return { accepted: false, status: 'failed', code: 'tracking_unavailable', message: 'Email delivery tracking is unavailable; the email was not sent.' };
    }

    const body = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: recipient, ...(recipientName ? { name: String(recipientName).slice(0, 100) } : {}) }],
      subject: safeSubject,
      htmlContent,
      textContent,
      tags: ['scoreflow', category, trackingId],
    };
    let response;
    try {
      response = await fetchImpl(BREVO_EMAIL_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      logger.error(`Brevo ${category} email request failed:`, error.message);
      await DeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: 'unknown', reason: 'The provider response was not received; acceptance is unknown.', lastEventAt: new Date() } }).catch(() => {});
      return { accepted: false, status: 'unknown', code: 'provider_unreachable', message: 'The email provider could not be reached; acceptance is unknown.' };
    }

    if (!response.ok) {
        let responseBody = '';
        try { responseBody = await response.text(); } catch { /* Keep the provider response status. */ }
        const safeReason = responseBody.match(/"code"\s*:\s*"([a-zA-Z0-9_-]{1,80})"/)?.[1] || `HTTP ${response.status}`;
        logger.error(`Brevo rejected ${category} email (${safeReason}).`);
        await DeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: 'failed', reason: `Brevo rejected the request (${safeReason}).`, lastEventAt: new Date() } }).catch((error) => {
          logger.error('Failed to save Brevo rejection status:', error.message);
        });
        return { accepted: false, status: 'failed', code: 'provider_rejected', message: 'Brevo rejected this email. Check the sender verification and request configuration.' };
    }

    let providerMessageId = '';
    try {
      const result = await response.json();
      if (typeof result?.messageId === 'string') providerMessageId = result.messageId.trim();
    } catch { /* A successful HTTP response is accepted even if Brevo omitted its optional JSON body. */ }
    await DeliveryModel.updateOne({ _id: delivery._id }, { $set: {
      status: 'accepted', providerMessageId, acceptedAt: new Date(), lastEventAt: new Date(),
    } }).catch((error) => {
      logger.error('Brevo accepted the email, but delivery tracking could not be updated:', error.message);
    });
    return {
      accepted: true, status: 'accepted', trackingId,
      ...(providerMessageId ? { messageId: providerMessageId } : {}),
      message: 'Brevo accepted the email; delivery is not yet confirmed.',
    };
  }

  async function sendJudgeInvitation({ judge, event, token, emailDraft }) {
    const { clientUrl } = configProvider();
    const baseUrl = publicClientUrl(clientUrl);
    if (!baseUrl) return { accepted: false, status: 'failed', code: 'public_client_url_required', message: 'Judge invitation email requires CLIENT_URL to be a public HTTPS frontend URL.' };
    const email = buildJudgeInvitationEmail({
      judgeName: judge.name, eventName: event.name, eventDate: event.date,
      invitationUrl: `${baseUrl}/judge/invite/${encodeURIComponent(token)}`, emailDraft,
    });
    return sendTransactionalEmail({
      category: 'judge_invitation', recipientEmail: judge.email, recipientName: judge.name,
      subject: email.subject, htmlContent: email.html, textContent: email.text,
      eventId: event._id || judge.eventId, contextId: judge._id, requirePublicClientUrl: true,
    });
  }

  async function sendAnnouncementEmail({ recipientEmail, subject, message, eventName, eventId, contextId }) {
    const safeEventName = escapeHtml(eventName || 'ScoreFlow event');
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
    return sendTransactionalEmail({
      category: 'announcement', recipientEmail, subject, eventId, contextId,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202b40"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e5e9f0;border-radius:12px"><p style="color:#4169df;font-weight:bold;letter-spacing:.08em">SCOREFLOW</p><p>Announcement for ${safeEventName}</p><h1 style="font-size:22px">${safeSubject}</h1><p style="line-height:1.6">${safeMessage}</p></main></body></html>`,
      textContent: `${eventName || 'ScoreFlow event'}\n\n${subject}\n\n${message}`,
    });
  }

  async function sendResultReportEmail({ recipientEmail, recipientName, teamName, eventName, report, eventId, contextId, referenceId }) {
    let email;
    try { email = buildResultReportEmail({ recipientName, teamName, eventName, report }); }
    catch { return { accepted: false, status: 'failed', code: 'invalid_report', message: 'The saved report is not valid for email delivery.' }; }
    return sendTransactionalEmail({
      category: 'result_report', recipientEmail, recipientName, subject: email.subject,
      htmlContent: email.html, textContent: email.text, eventId, contextId, referenceId,
    });
  }

  return { sendTransactionalEmail, sendJudgeInvitation, sendAnnouncementEmail, sendResultReportEmail };
}

const service = createEmailService();
module.exports = { ...service, createEmailService, normalizeProviderEvent, publicClientUrl, getBrevoConfig };
