const isNotApplicable = (value) => typeof value === 'string' && value.trim().toUpperCase().replace('/', '') === 'NA';

const getRatedLikertValues = (responses = {}) => Object.values(responses || {})
  .filter((value) => !isNotApplicable(value))
  .map(Number)
  .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);

const isValidLikertResponse = (value) => isNotApplicable(value)
  || (Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5);

const calculateLikertPercentage = (responses = {}) => {
  const values = getRatedLikertValues(responses);
  if (!values.length) return 0;
  return (values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100;
};

module.exports = { isNotApplicable, isValidLikertResponse, getRatedLikertValues, calculateLikertPercentage };
