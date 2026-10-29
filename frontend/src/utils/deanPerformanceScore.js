const percentage = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, 0), 100) : 0;
};

export const calculateDeanPerformanceScore = ({ student = 0, directorate = 0, peer = 0, hasAssignedCourses }) => {
  const studentScore = percentage(student);
  const directorateScore = percentage(directorate);
  const peerScore = percentage(peer);
  const studentWeight = hasAssignedCourses ? 50 : 0;
  const directorateWeight = 30;
  const peerWeight = 20;
  const studentWeighted = Number((studentScore * studentWeight / 100).toFixed(2));
  const directorateWeighted = Number((directorateScore * directorateWeight / 100).toFixed(2));
  const peerWeighted = Number((peerScore * peerWeight / 100).toFixed(2));
  const weightedSubtotal = Number((studentWeighted + directorateWeighted + peerWeighted).toFixed(2));
  const activeWeight = studentWeight + directorateWeight + peerWeight;
  const totalScore = hasAssignedCourses
    ? weightedSubtotal
    : Number((weightedSubtotal / activeWeight * 100).toFixed(2));

  return {
    studentScore,
    directorateScore,
    peerScore,
    studentWeight,
    directorateWeight,
    peerWeight,
    activeWeight,
    studentWeighted,
    directorateWeighted,
    peerWeighted,
    weightedSubtotal,
    totalScore,
  };
};
