import type { SavingsGoal } from "./types";

export const SAVINGS_GOALS_UPDATED_EVENT = "savings-goals-updated";

export function notifySavingsGoalsUpdated() {
  window.dispatchEvent(new CustomEvent(SAVINGS_GOALS_UPDATED_EVENT));
}

type GoalAmounts = Pick<SavingsGoal, "current_amount" | "stock_pnl">;

/** Principal only (excludes synced investment gains). */
export function getGoalPrincipal(goal: GoalAmounts): number {
  return goal.current_amount;
}

/** Gross saved total = principal + investment gains. */
export function getGoalNetSaving(goal: GoalAmounts): number {
  return goal.current_amount + (goal.stock_pnl ?? 0);
}

export function splitPrincipalFromGross(gross: number, stockPnl: number): number {
  return Math.max(gross - (stockPnl ?? 0), 0);
}

export function getTotalNetSaving(goals: GoalAmounts[]): number {
  return goals.reduce((sum, g) => sum + getGoalNetSaving(g), 0);
}

/** Progress toward target (net saving rate vs goal), same basis as Dashboard. */
export function getGoalNetSavingRate(
  goal: GoalAmounts & Pick<SavingsGoal, "target_amount">,
): number {
  if (goal.target_amount <= 0) return 0;
  return (getGoalNetSaving(goal) / goal.target_amount) * 100;
}