export const RESULT_REPORT_SECTION_TITLES = {
  summary: 'Executive Summary',
  strengths: 'Key Strengths',
  weaknesses: 'Areas for Improvement',
  improvementSuggestions: 'Actionable Recommendations',
  priorityAreas: 'Recommended Focus',
  judgeFeedbackSummary: 'Judge Feedback Summary',
  finalRemarks: 'Final Remarks',
};

const hasNumericEvaluationContent = (value) => /\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b|\b(?:placed|finished|came\s+in)\s+(?:first|second|third|last)\b|\b(?:first|second|third|last)\s+place\b|\btop\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+out\s+of\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.test(value);

export function reportIsQualitative(report) {
  if (!report) return false;
  const values = [
    report.summary,
    ...(report.strengths || []),
    ...(report.weaknesses || []),
    ...(report.improvementSuggestions || []),
    ...(report.priorityAreas || []),
    report.judgeFeedbackSummary,
    report.finalRemarks,
  ];
  return values.every((value) => typeof value === 'string' && !hasNumericEvaluationContent(value));
}
