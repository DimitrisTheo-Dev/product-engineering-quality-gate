import { expect, test } from "vitest";
import { filterTasks } from "../src/tasks";

test("filters case-insensitively and ignores outer spaces", () => {
  expect(filterTasks("  SMOKE  ")).toEqual(["Run smoke tests"]);
});

test("returns an empty result when no task matches", () => {
  expect(filterTasks("invoice")).toEqual([]);
});
