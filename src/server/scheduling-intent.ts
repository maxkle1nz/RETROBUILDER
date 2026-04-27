const SCHEDULING_PRODUCT_PATTERN = /\b(booking|book\b|appointment|reservation|reserve|consult|consultation|intake|schedule|scheduler|calendar|date|slot|availability|availableSlots|date picker|time[-\s]?slot|appointment time|booking time|delivery window|delivery slot)\b/i;
const DIRECT_SCHEDULING_INTENT_PATTERN = /\b(booking|book\b|reservation|reserve|consult(?:ation)? booking|intake|schedule|scheduler|calendar|slot|availability|availableSlots|date picker|time[-\s]?slot|appointment request|request (?:an? )?(?:appointment|consultation)|confirm (?:an? )?(?:appointment|consultation))\b/i;
const CONTEXTUAL_RECORD_SURFACE_PATTERN = /\b(vehicle notes?|service notes?|repair notes?|inspection notes?|customer notes?|client notes?|staff notes?|notes and history|vehicle history|service history|repair history|maintenance log|record|profile|timeline|crm follow-up|follow-up board)\b/i;
const GAME_SAVE_CONTEXT_PATTERN = /\b(save[-\s]?slots?|save cassettes?|save files?|checkpoint|game|player|beat|producer|music|rhythm|chapter|achievement|career map|story map|level)\b/i;
const HARD_SCHEDULING_INTENT_PATTERN = /\b(booking|book\b|appointment|reservation|reserve|consult(?:ation)? booking|intake|schedule|scheduler|calendar|date picker|time[-\s]?slot|appointment request|request (?:an? )?(?:appointment|consultation)|confirm (?:an? )?(?:appointment|consultation))\b/i;
const NEGATED_SCHEDULING_MENTION_PATTERN = /\b(?:not|no|without|avoid|avoids|exclude|excluding|instead of|rather than|out of scope|must not|should not|is not|isn't)\b[\w\s/+&-]{0,96}\b(?:booking|book\b|appointment|reservation|reserve|consult(?:ation)?|intake|schedule|scheduler|calendar|slot|availability|availableSlots|date picker|time slot)\b/gi;

function withoutNegatedSchedulingMentions(productText: string) {
  return productText.replace(NEGATED_SCHEDULING_MENTION_PATTERN, ' ');
}

export function isContextualRecordSurface(productText: string) {
  const schedulingText = withoutNegatedSchedulingMentions(productText);
  return CONTEXTUAL_RECORD_SURFACE_PATTERN.test(productText) && !DIRECT_SCHEDULING_INTENT_PATTERN.test(schedulingText);
}

export function needsSchedulingControls(productText: string) {
  const schedulingText = withoutNegatedSchedulingMentions(productText);
  if (!SCHEDULING_PRODUCT_PATTERN.test(schedulingText)) {
    return false;
  }
  if (GAME_SAVE_CONTEXT_PATTERN.test(productText) && !HARD_SCHEDULING_INTENT_PATTERN.test(schedulingText)) {
    return false;
  }
  return !isContextualRecordSurface(schedulingText);
}
