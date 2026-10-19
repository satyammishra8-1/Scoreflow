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
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'ScoreFlow',
    clientUrl: process.env.CLIENT_URL,
  };
}

async function sendJudgeInvitation({ judge, event, token }) {
  const { apiKey, senderEmail, senderName, clientUrl } = getBrevoConfig();
  if (!apiKey || !senderEmail || !clientUrl) {
    return { sent: false, message: 'Invitation saved, but email is not configured. Set the Brevo and client URL environment variables, then resend.' };
  }

  const invitationUrl = `${clientUrl.replace(/\/+$/, '')}/judge/invite/${encodeURIComponent(token)}`;
  const eventDate = event.date ? new Date(event.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
  const safeName = escapeHtml(judge.name);
  const safeEventName = escapeHtml(event.name);
  const safeDate = escapeHtml(eventDate);
  const safeUrl = escapeHtml(invitationUrl);
  const dateMarkup = safeDate ? `<p><strong>Event date:</strong> ${safeDate}</p>` : '';
  const textDate = eventDate ? `\nEvent date: ${eventDate}` : '';

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
        subject: `You're invited to judge ${event.name}`,
        htmlContent: `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#202b40"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #e5e9f0;border-radius:12px"><p style="color:#4169df;font-weight:bold;letter-spacing:.08em">SCOREFLOW</p><h1 style="font-size:24px">You're invited to judge ${safeEventName}</h1><p>Hello ${safeName},</p><p>You've been invited to judge this event in ScoreFlow. Accept the invitation to verify your email address and open your judge dashboard.</p>${dateMarkup}<p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:7px;background:#4169df;color:#fff;text-decoration:none;font-weight:bold">Accept Invitation</a></p><p style="color:#7a8497;font-size:12px">This invitation link expires in 48 hours and can only be used once.</p></main></body></html>`,
        textContent: `Hello ${judge.name},\n\nYou've been invited to judge ${event.name} in ScoreFlow.${textDate}\n\nAccept the invitation: ${invitationUrl}\n\nThis invitation link expires in 48 hours and can only be used once.`,
      }),
    });
    if (!response.ok) {
      return { sent: false, message: 'Invitation saved, but Brevo could not send the email. Please try resending.' };
    }
    return { sent: true };
  } catch (error) {
    console.error('Brevo invitation request failed:', error.message);
    return { sent: false, message: 'Invitation saved, but the email service is temporarily unavailable. Please try resending.' };
  }
}

module.exports = { sendJudgeInvitation };
