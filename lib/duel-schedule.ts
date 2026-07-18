export const PUBLIC_DUEL_MIN_LEAD_MS = 31 * 60 * 1000;
export const PUBLIC_DUEL_MIN_DURATION_MS = 15 * 60 * 1000;

export type DuelScheduleValidation =
  | { valid: true; startDate: Date; endDate: Date }
  | { valid: false; error: string };

export function validateDuelSchedule(
  startTime: string,
  endTime: string,
  now = Date.now(),
): DuelScheduleValidation {
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  if (Number.isNaN(startDate.valueOf())) {
    return { valid: false, error: "Choose a valid start time." };
  }
  if (startDate.valueOf() < now + PUBLIC_DUEL_MIN_LEAD_MS) {
    return { valid: false, error: "Public duels must start at least 31 minutes from now." };
  }
  if (Number.isNaN(endDate.valueOf())) {
    return { valid: false, error: "Choose a valid closing time." };
  }
  if (endDate.valueOf() < startDate.valueOf() + PUBLIC_DUEL_MIN_DURATION_MS) {
    return { valid: false, error: "Closing time must be at least 15 minutes after the start." };
  }

  return { valid: true, startDate, endDate };
}
