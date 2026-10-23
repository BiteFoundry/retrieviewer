// Build only allowlisted public runtime assets. No credentials, experiments or
// workspace directory copies. Output stays ignored and is never an npm input.
import { cp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve, relative } from "node:path";
import { createPet } from "../retrieviewer.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "site-dist"),
  runtime = join(out, "runtime");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir(runtime, { recursive: true });
await cp(join(root, "docs"), out, { recursive: true });
for (const name of [...pkg.files, "package.json"]) {
  const target = resolve(runtime, name);
  if (!relative(runtime, target) || relative(runtime, target).startsWith(".."))
    throw Error("Invalid public asset path");
  await mkdir(resolve(target, ".."), { recursive: true });
  await cp(join(root, name), target, { recursive: true });
}
const puppy = await createPet({ seed: 731 });
try {
  await writeFile(
    join(out, "preview.txt"),
    puppy.frame({ columns: 144, rows: 60, poseFps: 24 }).text,
  );
} finally {
  puppy.dispose();
}
await writeFile(join(out, ".nojekyll"), "");
for (const file of [
  "index.html",
  "style.css",
  "app.mjs",
  "preview.txt",
])
  if (!(await stat(join(out, file))).isFile())
    throw Error("Missing site file " + file);
console.log("Built public site: " + out + " (runtime art loads only on Play)");
