export const tasks = ["Review pull request", "Run smoke tests", "Publish release notes"];

export function filterTasks(query: string) {
  const term = query.trim().toLowerCase();
  return tasks.filter((task) => task.toLowerCase().includes(term));
}
