const asPercentage = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(Math.max(score, 0), 100) : 0;
};

const weightedContribution = (score, weight) => Number((asPercentage(score) * weight / 100).toFixed(2));

const calculateDirectorateScore = ({ peerRaw, vicePresidentRaw, studentRaw, studentApplicable }) => {
  const peerWeight = 20;
  const vicePresidentWeight = 30;
  const studentWeight = studentApplicable ? 50 : 0;
  const peerWeighted = weightedContribution(peerRaw, peerWeight);
  const vicePresidentWeighted = weightedContribution(vicePresidentRaw, vicePresidentWeight);
  const studentWeighted = studentApplicable ? weightedContribution(studentRaw, studentWeight) : 0;
  const totalWeight = studentApplicable ? 100 : peerWeight + vicePresidentWeight;
  const weightedSubtotal = Number((peerWeighted + vicePresidentWeighted + studentWeighted).toFixed(2));
  const totalScore = Number((weightedSubtotal / totalWeight * 100).toFixed(2));

  return {
    peerWeight,
    vicePresidentWeight,
    studentWeight,
    peerWeighted,
    vicePresidentWeighted,
    studentWeighted,
    totalWeight,
    weightedSubtotal,
    totalScore,
  };
};

module.exports = { calculateDirectorateScore };
