const parseRaw = (value) => Number.parseFloat(value) || 0;

const normalizeObsScore = (value) => {
  const raw = parseRaw(value);
  if (raw > 0 && raw <= 30) return (raw / 30) * 100;
  return raw;
};

const computeEvaluation = (studentRaw, deptHeadRaw, peerRaw) => {
  const sRaw = parseRaw(studentRaw);
  const dRaw = normalizeObsScore(deptHeadRaw);
  const pRaw = parseRaw(peerRaw);

  const sWeighted = sRaw * 0.50;
  const dWeighted = dRaw * 0.30;
  const pWeighted = pRaw * 0.20;
  const total = sWeighted + dWeighted + pWeighted;

  let grade = 'Unsatisfactory';
  if (total >= 85) grade = 'Excellent';
  else if (total >= 75) grade = 'Very Good';
  else if (total >= 65) grade = 'Good';
  else if (total >= 50) grade = 'Satisfactory';

  return {
    studentRaw: Number(sRaw.toFixed(2)),
    studentWeighted: Number(sWeighted.toFixed(2)),
    deptHeadRaw: Number(dRaw.toFixed(2)),
    deptHeadWeighted: Number(dWeighted.toFixed(2)),
    peerRaw: Number(pRaw.toFixed(2)),
    peerWeighted: Number(pWeighted.toFixed(2)),
    totalScore: Number(total.toFixed(2)),
    grade,
  };
};

module.exports = { computeEvaluation };
