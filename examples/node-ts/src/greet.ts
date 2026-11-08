export function greet(name: string): string {
  if (!name.trim()) throw new Error("Name is required");
  return `Hello, ${name.trim()}`;
}
