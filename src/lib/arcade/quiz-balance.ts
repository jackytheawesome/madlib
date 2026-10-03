function quizBalance(correct: number, total: number): number {
  return total > 0 ? (total - 2 * correct) / total : 0;
}

/** Correct and incorrect answers offset each other; an unanswered vote is incorrect. */
export function quizHealthMultiplier(correct: number, total: number): number {
  return 1 + 0.3 * quizBalance(correct, total);
}

/** Signed percentage for display, rounded symmetrically without negative zero. */
export function quizHealthAdjustment(correct: number, total: number): number {
  const percentage = 30 * quizBalance(correct, total);
  const rounded = Math.round(Math.abs(percentage));
  return rounded === 0 ? 0 : Math.sign(percentage) * rounded;
}
