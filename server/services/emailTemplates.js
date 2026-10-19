function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatEventDate(value) {
  if (!value) return 'To be announced';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'To be announced';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function buildJudgeInvitationEmail({ judgeName, eventName, eventDate, invitationUrl }) {
  const safeJudgeName = escapeHtml(judgeName || 'Judge');
  const safeEventName = escapeHtml(eventName || 'ScoreFlow Event');
  const date = formatEventDate(eventDate);
  const safeDate = escapeHtml(date);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const subject = `Invitation to Judge — ${eventName || 'ScoreFlow Event'}`;
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:24px;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#263247">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e8ef;border-radius:14px;overflow:hidden">
      <tr><td style="padding:28px 36px;background:#263c72;color:#ffffff;font-size:13px;font-weight:bold;letter-spacing:2px">SCOREFLOW</td></tr>
      <tr><td style="padding:36px">
        <p style="margin:0 0 8px;color:#52617a;font-size:13px">JUDGE INVITATION</p>
        <h1 style="margin:0 0 24px;font-size:25px;line-height:1.3;color:#1e2c45">Invitation to Judge</h1>
        <p style="font-size:16px;line-height:1.65">Dear ${safeJudgeName},</p>
        <p style="font-size:16px;line-height:1.65">You have been invited to serve as a judge for <strong>${safeEventName}</strong>.</p>
        <p style="padding:14px 16px;background:#f5f7fb;border-radius:8px;font-size:14px;line-height:1.5"><strong>Event Date:</strong> ${safeDate}</p>
        <p style="font-size:15px;line-height:1.65">Please click the button below to accept your invitation and access your Judge Dashboard.</p>
        <p style="margin:28px 0;text-align:center"><a href="${safeInvitationUrl}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#4169df;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold">Accept Invitation</a></p>
        <p style="font-size:14px;line-height:1.6;color:#52617a">Thank you,<br><strong>ScoreFlow Team</strong></p>
        <p style="margin:24px 0 0;color:#8993a3;font-size:12px;line-height:1.5">This secure invitation link is single-use and expires in 48 hours.</p>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `Dear ${judgeName || 'Judge'},\n\nYou have been invited to serve as a judge for ${eventName || 'ScoreFlow Event'}.\n\nEvent Date: ${date}\n\nPlease accept your invitation and access your Judge Dashboard: ${invitationUrl}\n\nThank you,\nScoreFlow Team\n\nThis secure invitation link is single-use and expires in 48 hours.`;
  return { subject, html, text };
}

module.exports = { buildJudgeInvitationEmail, formatEventDate };
