export function normalizeSubmissionKey(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(key) ? key : `field_${key || "value"}`;
}

export function allocateSubmissionKey(
  label: string,
  existingKeys: Iterable<string>
): string {
  const base = normalizeSubmissionKey(label);
  const used = new Set(existingKeys);
  let suffix = 1;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
