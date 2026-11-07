const REPORT_FIELDS = [
  'summary',
  'strengths',
  'weaknesses',
  'whyThisMatters',
  'improvementSuggestions',
  'priorityAreas',
  'judgeFeedbackSummary',
  'finalRemarks',
];

function validReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== [...REPORT_FIELDS].sort().join('|')) return false;
  const fieldsValid = REPORT_FIELDS.every((field) => field === 'strengths' || field === 'weaknesses'
    || field === 'improvementSuggestions' || field === 'priorityAreas'
    ? Array.isArray(value[field]) && value[field].length > 0
      && value[field].length <= (field === 'priorityAreas' ? 5 : 8)
      && value[field].every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 1000)
    : typeof value[field] === 'string' && value[field].trim().length > 0 && value[field].length <= 4000);
  return fieldsValid && value.priorityAreas.every((item) => /^(?:High Priority|Medium Priority|Good to Maintain):\s+\S/i.test(item));
}

function reportIsQualitative(report) {
  if (!validReport(report)) return false;
  return REPORT_FIELDS.every((field) => (Array.isArray(report[field]) ? report[field] : [report[field]])
    .every((value) => !hasNumericEvaluationContent(value) && !hasAiAttribution(value)));
}

function hasAiAttribution(value) {
  return /\bAI\s*(?:generated|powered)\b|\bgenerated\s+by\s+AI\b/iu.test(value);
}

function hasNumericEvaluationContent(value) {
  return /\d|\b(?:scores?|marks?|weights?|percentages?|rank(?:ed|ing)?|positions?|votes?|averages?|totals?)\b|\b(?:placed|finished|came\s+in)\s+(?:first|second|third|last)\b|\b(?:first|second|third|last)\s+place\b|\btop\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+out\s+of\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/iu.test(value);
}

module.exports = { REPORT_FIELDS, validReport, reportIsQualitative, hasNumericEvaluationContent, hasAiAttribution };
