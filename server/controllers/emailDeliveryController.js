const mongoose = require('mongoose');
const EmailDelivery = require('../models/EmailDelivery');
const { normalizeProviderEvent } = require('../services/emailService');

const EVENT_TIME_FIELDS = ['ts_event', 'ts_epoch', 'ts'];

function eventTimestamp(payload) {
  for (const key of EVENT_TIME_FIELDS) {
    const value = Number(payload?.[key]);
    if (Number.isFinite(value) && value > 0) return new Date(value < 1e12 ? value * 1000 : value);
  }
  return new Date();
}

function getTrackingIds(payload) {
  const values = Array.isArray(payload?.tags) ? [...payload.tags] : [];
  const singleTag = payload?.tag;
  if (typeof singleTag === 'string') {
    try {
      const parsed = JSON.parse(singleTag);
      if (Array.isArray(parsed)) values.push(...parsed);
      else values.push(singleTag);
    } catch { values.push(singleTag); }
  }
  if (typeof payload?.['X-Mailin-custom'] === 'string') values.push(payload['X-Mailin-custom']);
  return [...new Set(values.filter((value) => typeof value === 'string'))];
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && require('node:crypto').timingSafeEqual(a, b);
}

function createEmailDeliveryController({ DeliveryModel = EmailDelivery, config = () => ({
  username: process.env.BREVO_WEBHOOK_USERNAME || '', password: process.env.BREVO_WEBHOOK_PASSWORD || '',
}) } = {}) {
  async function receiveBrevoEvent(req, res) {
    const { username, password } = config();
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    if (!username || !password || !secureEqual(req.get?.('authorization') || req.headers?.authorization, expected)) {
      return res.status(401).json({ success: false, error: 'Unauthorized webhook request.' });
    }
    const payloads = Array.isArray(req.body) ? req.body : [req.body];
    let updated = 0;
    for (const payload of payloads) {
      const mapped = normalizeProviderEvent(payload);
      if (!mapped) continue;
      const providerMessageId = String(payload?.['message-id'] || payload?.messageId || '').trim();
      const trackingIds = getTrackingIds(payload);
      if (!providerMessageId && trackingIds.length === 0) continue;
      const eventAt = eventTimestamp(payload);
      const query = {
        $and: [{ $or: [
          ...(providerMessageId ? [{ providerMessageId }] : []),
          ...(trackingIds.length ? [{ trackingId: { $in: trackingIds } }] : []),
        ] }, { $or: [
          { providerEventId: '' },
          { providerEventId: null },
          { lastEventAt: null },
          { lastEventAt: { $lte: eventAt } },
        ] }],
      };
      const update = { $set: {
        status: mapped.status,
        providerEvent: mapped.event,
        providerEventId: payload?.id == null ? '' : String(payload.id),
        lastEventAt: eventAt,
        ...(mapped.status === 'delivered' ? { deliveredAt: eventAt, reason: '' } : {}),
        ...(['soft_bounced', 'hard_bounced', 'bounced', 'blocked', 'spam', 'invalid', 'unsubscribed', 'failed', 'deferred'].includes(mapped.status)
          ? { reason: String(payload?.reason || payload?.description || mapped.event).slice(0, 1000) } : {}),
        ...(providerMessageId ? { providerMessageId } : {}),
      } };
      const result = await DeliveryModel.updateOne(query, update);
      updated += result.modifiedCount || result.nModified || 0;
    }
    return res.status(200).json({ success: true, updated });
  }

  async function listByEvent(req, res) {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
    try {
      const records = await DeliveryModel.find({ eventId }).select('+recipientEmail').sort({ createdAt: -1 }).limit(500).lean();
      return res.status(200).json({ success: true, data: records.map((row) => ({
        category: row.category, recipientEmail: row.recipientEmail, subject: row.subject,
        status: row.status, message: row.reason || '', createdAt: row.createdAt,
        acceptedAt: row.acceptedAt, deliveredAt: row.deliveredAt,
      })) });
    } catch (error) {
      console.error('Failed to retrieve email delivery statuses:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve email delivery statuses.' });
    }
  }

  return { receiveBrevoEvent, listByEvent };
}

module.exports = { ...createEmailDeliveryController(), createEmailDeliveryController, eventTimestamp, getTrackingIds };
