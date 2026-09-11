import { readFile } from "node:fs/promises";

const manifestPath =
  process.argv[2] ?? ".next/server/server-reference-manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const references = [
  ...Object.values(manifest.node ?? {}),
  ...Object.values(manifest.edge ?? {}),
];
const forbiddenReaders = new Set([
  "getPublishedForm",
  "getUserPublishedFormIds",
]);
const exposed = references.filter(
  (reference) =>
    forbiddenReaders.has(reference.exportedName)
);

if (exposed.length > 0) {
  console.error(
    `Internal form readers were registered as Server Actions: ${exposed
      .map((reference) => reference.exportedName)
      .join(", ")}`
  );
  process.exitCode = 1;
} else {
  console.log("Internal form readers are absent from the Server Action manifest.");
}
