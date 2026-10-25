const mongoose = require('mongoose');
const Event = require('../models/Event');

function createEmailDraftController({
  emailType,
  EventModel = Event,
  fetchImpl = global.fetch,
  serviceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000',
  isValidId = mongoose.Types.ObjectId.isValid,
} = {}) {
  if (!['announcements', 'judge-invitations'].includes(emailType)) {
    throw new TypeError('A supported email draft type is required.');
  }

  return async function generateEmailDraft(req, res) {
    try {
      const eventId = typeof req.params.eventId === 'string' ? req.params.eventId.trim() : '';
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      if (prompt.length < 10 || prompt.length > 2000) {
        return res.status(400).json({ success: false, error: 'Describe the email in 10 to 2000 characters.' });
      }
      const event = await EventModel.findById(eventId).lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

      const payload = {
        prompt,
        eventName: String(event.name || 'ScoreFlow event'),
        eventType: String(event.type || 'Event'),
        eventDescription: typeof event.description === 'string' ? event.description : '',
      };
      if (emailType === 'announcements') {
        const audienceType = req.body?.audienceType;
        if (!['judges', 'teams'].includes(audienceType)) {
          return res.status(400).json({ success: false, error: 'Choose judges or teams as the audience.' });
        }
        payload.audienceType = audienceType;
      }

      let response;
      try {
        response = await fetchImpl(`${serviceUrl.replace(/\/$/, '')}/emails/${emailType}/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(100000),
        });
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return res.status(503).json({
          success: false,
          error: timedOut
            ? 'AI is taking too long to respond. Please try again.'
            : 'The AI writing service is not running or cannot be reached. Please try again later.',
          code: timedOut ? 'AI_SERVICE_TIMEOUT' : 'AI_SERVICE_UNAVAILABLE',
        });
      }
      if (!response.ok) {
        if (response.status === 422) {
          return res.status(400).json({ success: false, error: 'The AI service rejected this email request. Check the prompt and audience, then try again.', code: 'AI_EMAIL_REQUEST_INVALID' });
        }
        let detail;
        try { detail = (await response.json())?.detail; } catch { /* Keep provider errors private. */ }
        const code = typeof detail?.code === 'string' ? detail.code : '';
        if (response.status === 503 && code === 'missing_api_key') {
          return res.status(503).json({ success: false, error: 'AI writing is not configured. Ask your administrator to add the AI provider key.', code: 'AI_NOT_CONFIGURED' });
        }
        const safeReasons = {
          invalid_api_key: 'The AI provider rejected its configured key. Ask your administrator to check the AI configuration.',
          quota_exhausted: 'The AI provider is temporarily out of capacity. Please try again later.',
          model_unavailable: 'The configured AI model is unavailable. Ask your administrator to check the AI configuration.',
          timeout: 'The AI provider took too long to respond. Please try again.',
          network_error: 'The AI provider could not be reached. Please try again later.',
          malformed_response: 'The AI provider returned an unusable draft. Please try again.',
          invalid_provider: 'AI provider configuration is invalid. Ask your administrator to check the AI configuration.',
          provider_error: 'The AI provider could not complete the request. Please try again later.',
        };
        if (safeReasons[code]) return res.status(response.status === 503 ? 503 : 502).json({ success: false, error: safeReasons[code], code: `AI_${code.toUpperCase()}` });
        return res.status(502).json({ success: false, error: 'AI could not generate an email draft. Try again or write it manually.', code: 'AI_EMAIL_DRAFT_FAILED' });
      }

      let result;
      try {
        result = await response.json();
      } catch {
        return res.status(502).json({ success: false, error: 'AI returned an unreadable email draft.', code: 'AI_EMAIL_DRAFT_INVALID' });
      }
      const subject = typeof result?.emailDraft?.subject === 'string' ? result.emailDraft.subject.trim() : '';
      const body = typeof result?.emailDraft?.body === 'string' ? result.emailDraft.body.trim() : '';
      if (!subject || subject.length > 200 || !body || body.length > 8000) {
        return res.status(502).json({ success: false, error: 'AI returned an invalid email draft.', code: 'AI_EMAIL_DRAFT_INVALID' });
      }
      return res.status(200).json({
        success: true,
        data: { emailDraft: { subject, body }, model: result.model, promptVersion: result.promptVersion },
      });
    } catch (error) {
      console.error('Failed to generate email draft:', error);
      return res.status(500).json({ success: false, error: 'Failed to generate an email draft.' });
    }
  };
}

module.exports = { createEmailDraftController };
