import { mkdirSync, writeFileSync } from "node:fs";
import { greeting } from "./message.mjs";

mkdirSync("dist", { recursive: true });
writeFileSync("dist/greeting.txt", greeting() + "\n");
