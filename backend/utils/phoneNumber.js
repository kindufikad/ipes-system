const normalizeProfilePhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0[79]\d{8}$/.test(digits)) digits = `251${digits.slice(1)}`;
  else if (/^[79]\d{8}$/.test(digits)) digits = `251${digits}`;

  if (digits.startsWith('251')) {
    if (!/^[79]\d{8}$/.test(digits.slice(3))) {
      throw new Error('Ethiopian phone numbers must contain 9 digits after +251 and start with 7 or 9.');
    }
  } else if (!/^[1-9]\d{6,14}$/.test(digits)) {
    throw new Error('Enter a valid international phone number.');
  }

  return `+${digits}`;
};

module.exports = { normalizeProfilePhone };