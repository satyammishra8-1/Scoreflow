const mongoose = require('mongoose');
const Event = require('../models/Event');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const { validateDynamicEvaluationSchema } = require('../validators/dynamicEvaluationSchema');

function listExistingCriteria(config, { includeDynamicSchema = false } = {}) {
  const names = [
    ...(config?.criteriaBased?.criteria || []).map((item) => item.name),
    ...(config?.liveDemo?.criteria || []).map((item) => item.name),
    ...(config?.custom?.fields || []).map((item) => item.label),
  ].filter((value) => typeof value === 'string' && value.trim());
  if (includeDynamicSchema) {
    function addFields(fields) {
      for (const field of fields || []) {
        if (typeof field.label === 'string' && field.label.trim()) names.push(field.label.trim());
        if (field.type === 'group') addFields(field.children);
      }
    }
    for (const section of config?.dynamicSchema?.sections || []) {
      if (typeof section.name === 'string' && section.name.trim()) names.push(section.name.trim());
      addFields(section.fields);
    }
  }
  return names;
}

function createEvaluationSchemaController({ EventModel = Event, ConfigModel = EvaluationConfiguration, fetchImpl = global.fetch, serviceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000', isValidId = mongoose.Types.ObjectId.isValid } = {}) {
  return async function generateEvaluationSchema(req, res) {
    try {
      const eventId = typeof req.params.eventId === 'string' ? req.params.eventId.trim() : '';
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      if (prompt.length < 10 || prompt.length > 5000) return res.status(400).json({ success: false, error: 'Describe the evaluation in 10 to 5000 characters.' });
      const event = await EventModel.findById(eventId).lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const config = await ConfigModel.findOne({ eventId: String(event._id) }).lean();
      const existingCriteria = listExistingCriteria(config, { includeDynamicSchema: true });
      let response;
      try {
        response = await fetchImpl(serviceUrl.replace(/\/$/, '') + '/evaluation-schema/generate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, eventName: event.name, eventType: event.type, eventDescription: event.description || '', evaluationModel: config?.model || null, existingCriteria, existingConfiguration: config || {} }),
          signal: AbortSignal.timeout(210000),
        });
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return res.status(503).json({
          success: false,
          error: timedOut ? 'AI evaluation generation took too long. Please try again.' : 'The AI evaluation service is not running or cannot be reached. Please try again later.',
          code: timedOut ? 'AI_SERVICE_TIMEOUT' : 'AI_SERVICE_UNAVAILABLE',
        });
      }
      if (!response.ok) {
        if (response.status === 422) return res.status(400).json({ success: false, error: 'The AI service rejected this evaluation request. Check the description and event context, then try again.', code: 'AI_SCHEMA_REQUEST_INVALID' });
        let code = '';
        try { code = (await response.json())?.detail?.code || ''; } catch { /* Keep provider errors private. */ }
        const safeErrors = {
          missing_api_key: 'AI evaluation generation is not configured. Ask your administrator to add the AI provider key.',
          invalid_api_key: 'The AI provider rejected its configured key. Ask your administrator to check the AI configuration.',
          invalid_provider: 'AI provider configuration is invalid. Ask your administrator to check the AI configuration.',
          quota_exhausted: 'The AI provider is temporarily out of capacity. Please try again later.',
          model_unavailable: 'The configured AI model is unavailable. Ask your administrator to check the AI configuration.',
          timeout: 'The AI provider took too long to respond. Please try again.',
          network_error: 'The AI provider could not be reached. Please try again later.',
          malformed_response: 'The AI could not create a valid evaluation structure after one repair attempt. Try simplifying the description.',
          provider_error: 'The AI provider could not complete this request. Please try again later.',
        };
        return res.status(response.status === 503 ? 503 : 502).json({
          success: false,
          error: safeErrors[code] || 'AI could not generate a valid evaluation schema. Try a more specific description.',
          code: code ? 'AI_' + code.toUpperCase() : 'AI_SCHEMA_GENERATION_FAILED',
        });
      }
      let result;
      try { result = await response.json(); } catch { return res.status(502).json({ success: false, error: 'AI returned an unreadable evaluation schema.' }); }
      const checked = validateDynamicEvaluationSchema(result?.evaluationSchema, { existingNames: existingCriteria });
      if (checked.errors.length) return res.status(502).json({ success: false, error: 'AI returned an invalid evaluation structure. Try regenerating or simplify the requested criteria.', code: 'AI_SCHEMA_INVALID', details: checked.errors });
      return res.status(200).json({ success: true, data: { schema: checked.value, model: result.model, promptVersion: result.promptVersion } });
    } catch (error) {
      console.error('Failed to generate evaluation schema:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to generate an evaluation schema.' });
    }
  };
}

function createEvaluationSchemaValidationController({
  EventModel = Event,
  ConfigModel = EvaluationConfiguration,
  isValidId = mongoose.Types.ObjectId.isValid,
} = {}) {
  return async function validateEvaluationSchema(req, res) {
    try {
      const eventId = typeof req.params.eventId === 'string' ? req.params.eventId.trim() : '';
      if (!isValidId(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      const event = await EventModel.findById(eventId).lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
      const config = await ConfigModel.findOne({ eventId: String(event._id) }).lean();
      const checked = validateDynamicEvaluationSchema(req.body?.schema, { existingNames: listExistingCriteria(config) });
      if (checked.errors.length) return res.status(400).json({
        success: false,
        error: 'The edited evaluation structure needs correction before it can be added.',
        code: 'AI_SCHEMA_INVALID',
        details: checked.errors,
      });
      return res.status(200).json({ success: true, data: { schema: checked.value } });
    } catch (error) {
      console.error('Failed to validate evaluation schema:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to validate the evaluation structure.' });
    }
  };
}

module.exports = { createEvaluationSchemaController, createEvaluationSchemaValidationController };
