export const formatCollegeName = (value) => {
  const name = String(value || '')
    .replace(/^college of\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return '';

  const titleCasedName = name.toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bAnd\b/g, 'and');

  return `College of ${titleCasedName}`;
};