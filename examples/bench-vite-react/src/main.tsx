import { useState } from "react";
import { createRoot } from "react-dom/client";
import { filterTasks } from "./tasks";

function TaskList() {
  const [query, setQuery] = useState("");
  const tasks = filterTasks(query);
  return (
    <main>
      <h1>Tasks</h1>
      <label>
        Search tasks
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <ul>
        {tasks.map((task) => (
          <li key={task}>{task}</li>
        ))}
      </ul>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing task list container.");
createRoot(root).render(<TaskList />);
