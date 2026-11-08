export function resultLabel(count: number): string {
  if (!Number.isInteger(count) || count < 0) throw new Error("Count must be a nonnegative integer");
  return `${count} ${count === 1 ? "result" : "results"}`;
}
