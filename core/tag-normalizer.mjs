export function normalizeTags(value) {
  const input = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(input.map(tag => String(tag).trim()).filter(Boolean))];
}
export function tagsEqual(expected, actual) { return JSON.stringify([...normalizeTags(expected)].sort()) === JSON.stringify([...normalizeTags(actual)].sort()); }
