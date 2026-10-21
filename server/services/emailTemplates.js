const { reportIsQualitative } = require('./resultReportContent');

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

function buildResultReportEmail({ recipientName, teamName, eventName, report }) {
  if (!reportIsQualitative(report)) throw new TypeError('A valid qualitative result report is required.');
  const display = (value, fallback = '') => String(value || fallback).replace(/[\r\n]+/g, ' ').trim();
  const safeRecipient = escapeHtml(display(recipientName, 'Team member'));
  const safeTeam = escapeHtml(display(teamName, 'Your team'));
  const safeEvent = escapeHtml(display(eventName, 'ScoreFlow event'));
  const subject = `Your Evaluation Report — ${display(teamName, 'Your Team')} | ${display(eventName, 'ScoreFlow Event')}`;
  const sections = [
    ['Executive Summary', report.summary],
    ['Key Strengths', report.strengths],
    ['Areas for Improvement', report.weaknesses],
    ['Actionable Recommendations', report.improvementSuggestions],
    ['Recommended Focus', report.priorityAreas],
    ['Judge Feedback Summary', report.judgeFeedbackSummary],
    ['Final Remarks', report.finalRemarks],
  ];
  const htmlSections = sections.map(([title, content]) => {
    const body = Array.isArray(content)
      ? `<ul style="margin:0;padding-left:22px">${content.map((item) => `<li style="margin:0 0 8px;line-height:1.65;color:#43516a">${escapeHtml(item)}</li>`).join('')}</ul>`
      : `<p style="margin:0;line-height:1.7;color:#43516a">${escapeHtml(content)}</p>`;
    return `<tr><td class="section" style="padding:22px 32px;border-bottom:1px solid #e8edf4"><h2 style="margin:0 0 12px;font-size:17px;line-height:1.35;color:#253654">${title}</h2>${body}</td></tr>`;
  }).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:12px!important}.section{padding:18px 20px!important}.intro{padding:24px 20px!important}.brand{padding:18px 20px!important}}</style></head>
<body style="margin:0;padding:0;background:#f1f4f8;font-family:Arial,Helvetica,sans-serif;color:#263247">
<table role="presentation" class="outer" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 14px;background:#f1f4f8"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #e1e7ef;border-radius:14px;overflow:hidden">
<tr><td class="brand" style="padding:22px 32px;background:#263c72;color:#fff;font-size:13px;font-weight:bold;letter-spacing:2px">SCOREFLOW</td></tr>
<tr><td class="intro" style="padding:30px 32px 24px"><p style="margin:0 0 8px;color:#5368bf;font-size:12px;font-weight:bold;letter-spacing:1px">TEAM EVALUATION REPORT</p><h1 style="margin:0 0 18px;font-size:25px;line-height:1.3;color:#1e2c45">${safeTeam}</h1><p style="margin:0 0 10px;font-size:15px;line-height:1.65">Dear ${safeRecipient},</p><p style="margin:0;font-size:15px;line-height:1.65;color:#43516a">The evaluation report for <strong>${safeTeam}</strong> at <strong>${safeEvent}</strong> is ready. It brings together the judges’ observations and recommendations for your team.</p></td></tr>
${htmlSections}
<tr><td style="padding:24px 32px"><p style="margin:0;line-height:1.65;color:#43516a">We wish your team continued success.</p><p style="margin:16px 0 0;line-height:1.6;color:#43516a">Kind regards,<br><strong>ScoreFlow Team</strong></p></td></tr>
</table></td></tr></table></body></html>`;
  const textSections = sections.map(([title, content]) => `${title}\n${Array.isArray(content) ? content.map((item) => `• ${item}`).join('\n') : content}`).join('\n\n');
  const text = `Dear ${display(recipientName, 'Team member')},\n\nThe evaluation report for ${display(teamName, 'your team')} at ${display(eventName, 'ScoreFlow event')} is ready. It brings together the judges’ observations and recommendations for your team.\n\n${textSections}\n\nWe wish your team continued success.\n\nKind regards,\nScoreFlow Team`;
  return { subject, html, text };
}

module.exports = { buildJudgeInvitationEmail, buildResultReportEmail, formatEventDate };
