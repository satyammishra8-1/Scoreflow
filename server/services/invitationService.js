const crypto = require('crypto');
const Judge = require('../models/Judge');
const { sendJudgeInvitation } = require('./emailService');

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;

function createInvitationCredentials(now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(now + INVITATION_LIFETIME_MS),
  };
}

async function issueJudgeInvitation(judge, event) {
  const { token, tokenHash, expiresAt } = createInvitationCredentials();
  const updatedJudge = await Judge.findOneAndUpdate(
    { _id: judge._id, eventId: judge.eventId, invitationStatus: { $ne: 'accepted' } },
    {
      $set: {
        invitationStatus: 'pending',
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiresAt,
      },
      $unset: { invitationAcceptedAt: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!updatedJudge) return { sent: false, message: 'This judge can no longer receive an invitation.' };
  return sendJudgeInvitation({ judge: updatedJudge, event, token });
}

function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { createInvitationCredentials, hashInvitationToken, issueJudgeInvitation };
