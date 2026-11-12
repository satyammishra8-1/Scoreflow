const mongoose = require('mongoose');
const Event = require('../models/Event');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const Announcement = require('../models/Announcement');
const EmailDelivery = require('../models/EmailDelivery');
const { sendAnnouncementEmail } = require('../services/emailService');

const MAX_RECIPIENTS = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validId(id) { return mongoose.Types.ObjectId.isValid(id); }
function emailOf(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : '';
}
function summary(record, includeDeliveryResults = false) {
  const value = typeof record.toObject === 'function' ? record.toObject() : record;
  const { resolvedRecipients, recipientIds, deliveryResults, ...safe } = value;
  return {
    ...safe,
    ...(includeDeliveryResults && Array.isArray(deliveryResults) ? { deliveryResults } : {}),
    recipientCount: Array.isArray(resolvedRecipients) ? resolvedRecipients.length : (safe.sentCount || 0) + (safe.acceptedCount || 0) + (safe.failedCount || 0),
  };
}
function respond(res, status, error) { return res.status(status).json({ success: false, error }); }

function createAnnouncementController({ AnnouncementModel = Announcement, EmailDeliveryModel = EmailDelivery, sendEmail = sendAnnouncementEmail } = {}) {
  async function createAnnouncement(req, res) {
  try {
    const { eventId } = req.params;
    if (!validId(eventId)) return respond(res, 400, 'A valid eventId is required.');
    const event = await Event.findById(eventId).lean();
    if (!event) return respond(res, 404, 'Event not found.');

    const body = req.body || {};
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)) return respond(res, 400, 'A unique requestId is required for safe announcement delivery.');
    const audienceType = body.audienceType;
    const recipientMode = body.recipientMode;
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!['judges', 'teams'].includes(audienceType)) return respond(res, 400, 'Choose judges or teams as the audience.');
    if (!['all', 'specific'].includes(recipientMode)) return respond(res, 400, 'Choose all recipients or specific recipients.');
    if (!subject || subject.length > 200) return respond(res, 400, 'Subject is required and must be at most 200 characters.');
    if (!message || message.length > 10000) return respond(res, 400, 'Message is required and must be at most 10000 characters.');

    let selectedIds = [];
    if (recipientMode === 'specific') {
      if (!Array.isArray(body.recipientIds) || body.recipientIds.length === 0) return respond(res, 400, 'Select at least one recipient.');
      selectedIds = [...new Set(body.recipientIds.map((id) => String(id).trim()))];
      if (selectedIds.some((id) => !validId(id))) return respond(res, 400, 'One or more recipient IDs are invalid.');
      if (selectedIds.length > MAX_RECIPIENTS) return respond(res, 400, `Select no more than ${MAX_RECIPIENTS} recipients.`);
    }

    const Model = audienceType === 'judges' ? Judge : Team;
    const query = { eventId };
    if (recipientMode === 'specific') query._id = { $in: selectedIds };
    const recipients = await Model.find(query).lean();
    if (recipientMode === 'specific' && recipients.length !== selectedIds.length) {
      return respond(res, 400, `One or more selected ${audienceType} do not belong to this event.`);
    }

    const emails = audienceType === 'judges'
      ? recipients.map((judge) => emailOf(judge.email))
      : recipients.flatMap((team) => (Array.isArray(team.members) ? team.members : []).map((member) => emailOf(member.email)));
    const resolvedRecipients = [...new Set(emails.filter(Boolean))];
    if (!resolvedRecipients.length) return respond(res, 400, 'No valid recipient email addresses were found for this selection.');
    if (resolvedRecipients.length > MAX_RECIPIENTS) return respond(res, 400, `This announcement resolves to more than ${MAX_RECIPIENTS} email addresses.`);

    let announcement;
    try {
      announcement = await AnnouncementModel.create({
        eventId, requestId, audienceType, recipientMode,
        recipientIds: recipientMode === 'specific' ? selectedIds : [],
        subject, message, resolvedRecipients, sentCount: 0, acceptedCount: 0, deliveredCount: 0,
        failedCount: 0, deliveryResults: resolvedRecipients.map((recipientEmail) => ({ recipientEmail, status: 'sending' })),
        status: 'sending', sentAt: new Date(),
      });
    } catch (error) {
      if (error?.code === 11000) {
        const previous = await AnnouncementModel.findOne({ eventId, requestId }).lean();
        if (previous) return res.status(200).json({ success: true, replayed: true, data: summary(previous, true), deliveryMessage: 'This announcement request was already processed or is still running.' });
      }
      throw error;
    }

    let acceptedCount = 0;
    let failureMessage = '';
    const deliveryResults = [];
    for (const recipientEmail of resolvedRecipients) {
      let result;
      try {
        result = await sendEmail({ recipientEmail, subject, message, eventName: event.name, eventId });
      } catch (error) {
        result = { accepted: false, status: 'unknown', message: 'The provider response was not received; acceptance is unknown.' };
      }
      if (result?.accepted) acceptedCount += 1;
      else if (!failureMessage && result?.message) failureMessage = result.message;
      deliveryResults.push({
        recipientEmail,
      status: result?.accepted ? 'accepted' : result?.status === 'unknown' ? 'unknown' : result?.status === 'suppressed' ? 'suppressed' : 'failed',
        trackingId: result?.trackingId || '',
        providerMessageId: result?.messageId || '',
        reason: result?.accepted ? '' : (result?.message || 'Email submission failed.'),
      });
    }
    const failedCount = resolvedRecipients.length - acceptedCount;
    const status = acceptedCount === 0 ? 'failed' : failedCount === 0 ? 'accepted' : 'partial_accepted';
    const saved = await AnnouncementModel.findOneAndUpdate(
      { _id: announcement._id },
      { $set: { acceptedCount, deliveredCount: 0, failedCount, deliveryResults, status } },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    const note = status === 'accepted' ? 'Brevo accepted the announcement for all recipients. Delivery is not yet confirmed.' : status === 'partial_accepted'
      ? 'Brevo accepted the announcement for some recipients. Other submissions failed or have an unknown result.'
      : (failureMessage || 'Announcement could not be sent. Check Brevo configuration and try again.');
    return res.status(201).json({ success: true, data: summary(saved || { ...announcement, acceptedCount, failedCount, deliveryResults, status }, true), deliveryMessage: note });
  } catch (error) {
    console.error('Failed to create announcement:', error.message);
    return respond(res, 500, 'Failed to process this announcement. Please try again.');
  }
  }

  async function listAnnouncementsByEvent(req, res) {
    try {
      const { eventId } = req.params;
      if (!validId(eventId)) return respond(res, 400, 'A valid eventId is required.');
      const event = await Event.findById(eventId).select('_id').lean();
      if (!event) return respond(res, 404, 'Event not found.');
      const [records, emailRows] = await Promise.all([
        AnnouncementModel.find({ eventId }).select('+resolvedRecipients').sort({ createdAt: -1 }).lean(),
        EmailDeliveryModel.find({ eventId, category: 'announcement' }).sort({ createdAt: -1 }).lean(),
      ]);
      const latest = new Map();
      emailRows.forEach((row) => { if (!latest.has(row.trackingId)) latest.set(row.trackingId, row); });
      const data = records.map((record) => {
        const deliveryResults = (record.deliveryResults || []).map((result) => {
          const tracked = latest.get(result.trackingId);
          return tracked ? { ...result, status: tracked.status, reason: tracked.reason || '' } : result;
        });
        const acceptedCount = deliveryResults.filter((result) => ['accepted', 'sent', 'delivered'].includes(result.status)).length;
        const deliveredCount = deliveryResults.filter((result) => result.status === 'delivered').length;
        const failedCount = deliveryResults.filter((result) => ['failed', 'hard_bounced', 'soft_bounced', 'bounced', 'blocked', 'spam', 'invalid', 'unsubscribed', 'suppressed'].includes(result.status)).length;
        const status = deliveredCount === deliveryResults.length && deliveryResults.length ? 'sent'
          : failedCount ? (acceptedCount ? 'partial' : 'failed')
            : acceptedCount ? 'accepted' : record.status;
        return summary({ ...record, deliveryResults, acceptedCount, deliveredCount, failedCount, status }, true);
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Failed to list announcements:', error.message);
      return respond(res, 500, 'Failed to retrieve announcements.');
    }
  }
  return { createAnnouncement, listAnnouncementsByEvent };
}

module.exports = { ...createAnnouncementController(), createAnnouncementController, emailOf };
