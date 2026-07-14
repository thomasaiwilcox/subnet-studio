import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const artifact = resolve("dist/index.html");
const rootEntry = resolve("index.html");
await copyFile(artifact, rootEntry);
await copyFile(resolve("dist/social-preview.png"), resolve("social-preview.png"));
console.log("Published the offline artifact and social preview to the project root");
