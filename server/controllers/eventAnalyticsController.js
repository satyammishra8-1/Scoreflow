const mongoose = require('mongoose');
const Event = require('../models/Event');
const Team = require('../models/Team');
const Judge = require('../models/Judge');
const Evaluation = require('../models/Evaluation');
const ResultReport = require('../models/ResultReport');
const ResultReportDelivery = require('../models/ResultReportDelivery');
const Announcement = require('../models/Announcement');

function createEventAnalyticsController({
  EventModel = Event, TeamModel = Team, JudgeModel = Judge, EvaluationModel = Evaluation,
  ReportModel = ResultReport, DeliveryModel = ResultReportDelivery, AnnouncementModel = Announcement,
} = {}) {
  async function getEventAnalytics(req, res) {
    try {
      const { eventId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ success: false, error: 'A valid eventId is required.' });
      }
      const event = await EventModel.findById(eventId).select('_id').lean();
      if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

      const [totalTeams, totalJudges, evaluationTotals, reportsGenerated, reportEmailTotals, announcementEmailTotals] = await Promise.all([
        TeamModel.countDocuments({ eventId: event._id }),
        JudgeModel.countDocuments({ eventId: event._id }),
        JudgeModel.aggregate([
          { $match: { eventId: event._id } },
          { $project: { judgeId: '$_id', assignedTeamIds: { $setUnion: [{ $ifNull: ['$assignedTeamIds', []] }, []] } } },
          { $unwind: { path: '$assignedTeamIds', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: TeamModel.collection.name, let: { teamId: '$assignedTeamIds' }, pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$teamId'] }, { $eq: ['$eventId', event._id] }] } } },
            { $project: { _id: 1 } }, { $limit: 1 },
          ], as: 'assignedTeam' } },
          { $set: { hasAssignment: { $gt: [{ $size: '$assignedTeam' }, 0] } } },
          { $lookup: { from: EvaluationModel.collection.name, let: { judgeId: '$judgeId', teamId: '$assignedTeamIds' }, pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$eventId', event._id] }, { $eq: ['$judgeId', '$$judgeId'] },
              { $eq: ['$teamId', '$$teamId'] }, { $eq: ['$status', 'COMPLETED'] },
            ] } } }, { $project: { _id: 1 } }, { $limit: 1 },
          ], as: 'completedEvaluation' } },
          { $group: { _id: '$judgeId', assignments: { $sum: { $cond: ['$hasAssignment', 1, 0] } }, completed: { $sum: { $cond: [{ $and: ['$hasAssignment', { $gt: [{ $size: '$completedEvaluation' }, 0] }] }, 1, 0] } } } },
          { $group: { _id: null, totalAssignments: { $sum: '$assignments' }, completedEvaluations: { $sum: '$completed' },
            completedJudges: { $sum: { $cond: [{ $and: [{ $gt: ['$assignments', 0] }, { $eq: ['$assignments', '$completed'] }] }, 1, 0] } },
            judgesWithAssignments: { $sum: { $cond: [{ $gt: ['$assignments', 0] }, 1, 0] } } } },
        ]),
        ReportModel.countDocuments({ event: event._id }),
        DeliveryModel.aggregate([
          { $match: { event: event._id } }, { $unwind: '$members' }, { $match: { 'members.status': 'Sent' } },
          { $count: 'sent' },
        ]),
        AnnouncementModel.aggregate([
          { $match: { eventId: event._id } }, { $group: { _id: null, sent: { $sum: { $ifNull: ['$sentCount', 0] } } } },
        ]),
      ]);

      const evaluations = evaluationTotals[0] || { totalAssignments: 0, completedEvaluations: 0, completedJudges: 0, judgesWithAssignments: 0 };
      const totalAssignments = evaluations.totalAssignments || 0;
      const completedEvaluations = evaluations.completedEvaluations || 0;
      const completedJudges = evaluations.completedJudges || 0;
      const pendingJudges = Math.max(0, (evaluations.judgesWithAssignments || 0) - completedJudges);
      return res.status(200).json({ success: true, data: {
        eventId: String(event._id), totalTeams, totalJudges, totalAssignments, completedEvaluations,
        pendingEvaluations: Math.max(0, totalAssignments - completedEvaluations),
        evaluationProgressPercent: totalAssignments ? Math.round((completedEvaluations / totalAssignments) * 100) : 0,
        completedJudges, pendingJudges, judgesWithAssignments: evaluations.judgesWithAssignments || 0,
        judgeProgressPercent: evaluations.judgesWithAssignments ? Math.round((completedJudges / evaluations.judgesWithAssignments) * 100) : 0,
        reportsGenerated, emailsSent: (reportEmailTotals[0]?.sent || 0) + (announcementEmailTotals[0]?.sent || 0),
      } });
    } catch (error) {
      console.error('Failed to retrieve event analytics:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve event analytics.' });
    }
  }
  return { getEventAnalytics };
}

module.exports = { ...createEventAnalyticsController(), createEventAnalyticsController };
