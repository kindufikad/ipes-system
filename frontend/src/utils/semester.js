const ROMAN_SEMESTER_VALUES = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

export const normalizeSemester = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;

  const withoutLabel = text.replace(/^semester\s*/, '').trim();
  const romanValue = ROMAN_SEMESTER_VALUES[withoutLabel];
  if (romanValue !== undefined) return romanValue;

  const numericValue = Number.parseInt(withoutLabel, 10);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};
