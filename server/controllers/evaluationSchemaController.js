const mongoose = require('mongoose');
const Event = require('../models/Event');
const EvaluationConfiguration = require('../models/EvaluationConfiguration');
const { validateDynamicEvaluationSchema } = require('../validators/dynamicEvaluationSchema');

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
      const existingCriteria = [
        ...(config?.criteriaBased?.criteria || []).map((item) => item.name),
        ...(config?.liveDemo?.criteria || []).map((item) => item.name),
        ...(config?.custom?.fields || []).map((item) => item.label),
      ].filter((value) => typeof value === 'string' && value.trim());
      function addExistingSchemaFields(fields) {
        for (const field of fields || []) {
          if (typeof field.label === 'string' && field.label.trim()) existingCriteria.push(field.label.trim());
          if (field.type === 'group') addExistingSchemaFields(field.children);
        }
      }
      for (const section of config?.dynamicSchema?.sections || []) {
        if (typeof section.name === 'string' && section.name.trim()) existingCriteria.push(section.name.trim());
        addExistingSchemaFields(section.fields);
      }
      let response;
      try {
        response = await fetchImpl(serviceUrl.replace(/\/$/, '') + '/evaluation-schema/generate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, eventName: event.name, eventType: event.type, eventDescription: event.description || '', evaluationModel: config?.model || null, existingCriteria, existingConfiguration: config || {} }),
          signal: AbortSignal.timeout(120000),
        });
      } catch {
        return res.status(503).json({ success: false, error: 'AI evaluation schema service is unavailable.', code: 'AI_SERVICE_UNAVAILABLE' });
      }
      if (!response.ok) return res.status(502).json({ success: false, error: 'AI could not generate a valid evaluation schema. Try a more specific description.', code: 'AI_SCHEMA_GENERATION_FAILED' });
      let result;
      try { result = await response.json(); } catch { return res.status(502).json({ success: false, error: 'AI returned an unreadable evaluation schema.' }); }
      const checked = validateDynamicEvaluationSchema(result?.evaluationSchema, { existingNames: existingCriteria });
      if (checked.errors.length) return res.status(502).json({ success: false, error: 'AI returned an invalid evaluation schema.', details: checked.errors });
      return res.status(200).json({ success: true, data: { schema: checked.value, model: result.model, promptVersion: result.promptVersion } });
    } catch (error) {
      console.error('Failed to generate evaluation schema:', error);
      return res.status(500).json({ success: false, error: 'Failed to generate an evaluation schema.' });
    }
  };
}

module.exports = { createEvaluationSchemaController };
