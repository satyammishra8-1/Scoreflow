export const RESULT_REPORT_SECTION_TITLES = {
  summary: 'Executive Summary',
  strengths: 'Key Strengths',
  weaknesses: 'Areas for Improvement',
  improvementSuggestions: 'Actionable Recommendations',
  priorityAreas: 'Recommended Focus',
  judgeFeedbackSummary: 'Judge Feedback Summary',
  finalRemarks: 'Final Remarks',
};

const hasNumericEvaluationContent = (value) => /\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b/iu.test(value);

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
