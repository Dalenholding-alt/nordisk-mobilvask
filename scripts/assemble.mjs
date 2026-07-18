import { access, mkdir } from "node:fs/promises";

await mkdir("src", { recursive: true });
await mkdir("public/portal", { recursive: true });

for (const path of ["src/worker.js", "public/index.html", "public/portal/index.html"]) {
  await access(path);
}

console.log("Nordisk Mobilvask assets are ready.");
