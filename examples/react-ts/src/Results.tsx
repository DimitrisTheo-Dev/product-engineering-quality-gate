import { resultLabel } from "./label.js";

export function Results({ count }: { count: number }) {
  return <output aria-live="polite">{resultLabel(count)}</output>;
}
