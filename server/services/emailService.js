const { buildJudgeInvitationEmail } = require('./emailTemplates');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function getBrevoConfig() {
  return {
    apiKey: (process.env.BREVO_API_KEY || '').trim(),
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'ScoreFlow',
    clientUrl: process.env.CLIENT_URL,
  };
}

function isSmtpCredential(apiKey) {
  return apiKey.toLowerCase().startsWith('xsmtpsib-');
}

async function logBrevoRejection(label, response, apiKey) {
  let responseBody = '';
  try {
    responseBody = await response.text();
  } catch (error) {
    responseBody = `Unable to read Brevo response body: ${error.message}`;
  }
  const safeResponseBody = apiKey ? responseBody.split(apiKey).join('[REDACTED]') : responseBody;
  console.error(`Brevo ${label} rejected email. HTTP status: ${response.status}. Response body: ${safeResponseBody || '(empty)'}`);
}

async function sendJudgeInvitation({ judge, event, token }) {
  const { apiKey, senderEmail, senderName, clientUrl } = getBrevoConfig();
  if (isSmtpCredential(apiKey)) {
    return { sent: false, message: 'The configured Brevo credential is an SMTP key. Set BREVO_API_KEY to a Brevo API v3 key.' };
  }
  if (!apiKey || !senderEmail || !clientUrl) {
    return { sent: false, message: 'Invitation saved, but email is not configured. Set the Brevo and client URL environment variables, then resend.' };
  }

  const invitationUrl = `${clientUrl.replace(/\/+$/, '')}/judge/invite/${encodeURIComponent(token)}`;
  const email = buildJudgeInvitationEmail({
    judgeName: judge.name,
    eventName: event.name,
    eventDate: event.date,
    invitationUrl,
  });

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: judge.email, name: judge.name }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    });
    if (!response.ok) {
      await logBrevoRejection('judge invitation', response, apiKey);
      return { sent: false, message: 'Invitation saved, but Brevo could not send the email. Please try resending.' };
    }
    return { sent: true };
  } catch (error) {
    console.error('Brevo invitation request failed:', error.message);
    return { sent: false, message: 'Invitation saved, but the email service is temporarily unavailable. Please try resending.' };
  }
}

async function sendAnnouncementEmail({ recipientEmail, subject, message, eventName }) {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();
  if (isSmtpCredential(apiKey)) {
    return { sent: false, message: 'The configured Brevo credential is an SMTP key. Set BREVO_API_KEY to a Brevo API v3 key.' };
  }
  if (!apiKey || !senderEmail) {
    return { sent: false, message: 'Brevo email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.' };
  }

  const safeEventName = escapeHtml(eventName || 'ScoreFlow event');
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, '<br>');
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: recipientEmail }],
        subject,
        htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202b40"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e5e9f0;border-radius:12px"><p style="color:#4169df;font-weight:bold;letter-spacing:.08em">SCOREFLOW</p><p>Announcement for ${safeEventName}</p><h1 style="font-size:22px">${safeSubject}</h1><p style="line-height:1.6">${safeMessage}</p></main></body></html>`,
        textContent: `${eventName || 'ScoreFlow event'}\n\n${subject}\n\n${message}`,
      }),
    });
    if (!response.ok) {
      await logBrevoRejection('announcement', response, apiKey);
      return { sent: false, message: 'Brevo rejected this email. Check the sender configuration and try again.' };
    }
    return { sent: true };
  } catch (error) {
    console.error('Brevo announcement request failed:', error.message);
    return { sent: false, message: 'The email service is temporarily unavailable.' };
  }
}

module.exports = { sendJudgeInvitation, sendAnnouncementEmail };
