const mongoose = require('mongoose');
const Event = require('../models/Event');
const Judge = require('../models/Judge');
const Team = require('../models/Team');
const Announcement = require('../models/Announcement');
const { sendAnnouncementEmail } = require('../services/emailService');

const MAX_RECIPIENTS = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validId(id) { return mongoose.Types.ObjectId.isValid(id); }
function emailOf(value) {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : '';
}
function summary(record) {
  const value = typeof record.toObject === 'function' ? record.toObject() : record;
  const { resolvedRecipients, recipientIds, ...safe } = value;
  return { ...safe, recipientCount: Array.isArray(resolvedRecipients) ? resolvedRecipients.length : (safe.sentCount || 0) + (safe.failedCount || 0) };
}
function respond(res, status, error) { return res.status(status).json({ success: false, error }); }

exports.createAnnouncement = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!validId(eventId)) return respond(res, 400, 'A valid eventId is required.');
    const event = await Event.findById(eventId).lean();
    if (!event) return respond(res, 404, 'Event not found.');

    const body = req.body || {};
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

    let sentCount = 0;
    let failureMessage = '';
    for (const recipientEmail of resolvedRecipients) {
      const result = await sendAnnouncementEmail({ recipientEmail, subject, message, eventName: event.name });
      if (result?.sent) sentCount += 1;
      else if (!failureMessage && result?.message) failureMessage = result.message;
    }
    const failedCount = resolvedRecipients.length - sentCount;
    const status = sentCount === 0 ? 'failed' : failedCount === 0 ? 'sent' : 'partial';
    const announcement = await Announcement.create({
      eventId, audienceType, recipientMode,
      recipientIds: recipientMode === 'specific' ? selectedIds : [],
      subject, message, resolvedRecipients, sentCount, failedCount, status, sentAt: new Date(),
    });
    const note = status === 'sent' ? 'Announcement sent.' : status === 'partial'
      ? 'Announcement sent to some recipients; some deliveries failed.'
      : (failureMessage || 'Announcement could not be sent. Check Brevo configuration and try again.');
    return res.status(201).json({ success: true, data: summary(announcement), deliveryMessage: note });
  } catch (error) {
    console.error('Failed to create announcement:', error.message);
    return respond(res, 500, 'Failed to process this announcement. Please try again.');
  }
};

exports.listAnnouncementsByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!validId(eventId)) return respond(res, 400, 'A valid eventId is required.');
    const event = await Event.findById(eventId).select('_id').lean();
    if (!event) return respond(res, 404, 'Event not found.');
    const records = await Announcement.find({ eventId }).select('+resolvedRecipients').sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: records.map(summary) });
  } catch (error) {
    console.error('Failed to list announcements:', error.message);
    return respond(res, 500, 'Failed to retrieve announcements.');
  }
};
