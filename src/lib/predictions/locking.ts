export function canModifyPrediction(lockAt: string | Date, now = new Date()): boolean {
  return now.getTime() < new Date(lockAt).getTime();
}
export function assertPredictionOpen(lockAt: string | Date, now = new Date()): void {
  if (!canModifyPrediction(lockAt, now)) throw new Error("Predictions are locked for this match");
}
