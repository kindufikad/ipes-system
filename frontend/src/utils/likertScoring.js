export const LIKERT_OPTIONS = [1, 2, 3, 4, 5, 'NA'];

export const isNotApplicable = (value) => typeof value === 'string' && value.trim().toUpperCase().replace('/', '') === 'NA';

export const getRatedLikertValues = (responses = {}) => Object.values(responses)
  .filter((value) => !isNotApplicable(value))
  .map(Number)
  .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

export const calculateLikertPercentage = (responses = {}) => {
  const values = getRatedLikertValues(responses);
  if (!values.length) return 0;
  return (values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100;
};

export const hasLikertResponse = (value) => isNotApplicable(value) || getRatedLikertValues({ value }).length === 1;
