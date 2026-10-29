const parseRaw = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const calculateEvaluationScores = (studentRaw, deptHeadRaw, peerRaw) => {
  const sRaw = parseRaw(studentRaw);
  const dRaw = parseRaw(deptHeadRaw);
  const pRaw = parseRaw(peerRaw);

  const studentWeighted = sRaw * 0.5;
  const deptHeadWeighted = dRaw * 0.3;
  const peerWeighted = pRaw * 0.2;
  const totalScore = studentWeighted + deptHeadWeighted + peerWeighted;

  let grade = 'Unsatisfactory';
  if (totalScore >= 85) grade = 'Excellent';
  else if (totalScore >= 75) grade = 'Very Good';
  else if (totalScore >= 65) grade = 'Good';
  else if (totalScore >= 50) grade = 'Satisfactory';

  return {
    studentRaw: Number(sRaw.toFixed(2)),
    studentWeighted: Number(studentWeighted.toFixed(2)),
    deptHeadRaw: Number(dRaw.toFixed(2)),
    deptHeadWeighted: Number(deptHeadWeighted.toFixed(2)),
    peerRaw: Number(pRaw.toFixed(2)),
    peerWeighted: Number(peerWeighted.toFixed(2)),
    totalScore: Number(totalScore.toFixed(2)),
    grade,
  };
};

export default calculateEvaluationScores;
