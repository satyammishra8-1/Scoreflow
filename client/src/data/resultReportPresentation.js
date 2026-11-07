export const RESULT_REPORT_SECTION_TITLES = {
  summary: 'Executive Summary',
  strengths: 'What You Did Well',
  weaknesses: 'Where You Can Improve',
  whyThisMatters: 'Why This Matters',
  improvementSuggestions: 'Actionable Recommendations',
  priorityAreas: 'Priority Areas',
  judgeFeedbackSummary: 'Judge Feedback Summary',
  finalRemarks: 'Final Remarks',
};

const hasNumericEvaluationContent = (value) => /\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b|\b(?:placed|finished|came\s+in)\s+(?:first|second|third|last)\b|\b(?:first|second|third|last)\s+place\b|\btop\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+out\s+of\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.test(value);
const hasAiAttribution = (value) => /\bAI\s*(?:generated|powered)\b|\bgenerated\s+by\s+AI\b/iu.test(value);

export function reportIsQualitative(report) {
  if (!report) return false;
  const values = [
    report.summary,
    ...(report.strengths || []),
    ...(report.weaknesses || []),
    report.whyThisMatters,
    ...(report.improvementSuggestions || []),
    ...(report.priorityAreas || []),
    report.judgeFeedbackSummary,
    report.finalRemarks,
  ];
  return values.every((value) => typeof value === 'string' && !hasNumericEvaluationContent(value) && !hasAiAttribution(value))
    && (report.priorityAreas || []).every((item) => /^(?:High Priority|Medium Priority|Good to Maintain):\s+\S/i.test(item));
}

export function isDeliveryCurrentForReport(delivery, report) {
  if (!delivery?.reportId || !report?.reportId || String(delivery.reportId) !== String(report.reportId)) return false;
  const deliveredAt = Date.parse(delivery.createdAt);
  const generatedAt = Date.parse(report.generatedAt);
  return Number.isFinite(deliveredAt) && Number.isFinite(generatedAt) && deliveredAt >= generatedAt;
}
