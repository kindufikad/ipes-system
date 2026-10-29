import React from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';

const EVALUATION_CATEGORIES = [
  {
    category: "Core Competency: Subject Matter",
    criteria: [
      { id: 1, text: "Contribution in preparing and searching for teaching materials" },
      { id: 2, text: "Continuous update of the subject matter" },
      { id: 3, text: "Delivering seminars that are relevant to his teaching subject" },
      { id: 4, text: "Level of his/her subject matter knowledge and skill" }
    ]
  },
  {
    category: "Core Competency: Research and Community Services",
    criteria: [
      { id: 5, text: "Willingness and level of engagement in community service and volunteer activities" },
      { id: 6, text: "Participation on seminars/workshops at department/faculty/institution level during the year" },
      { id: 7, text: "Identifying priority areas in one's discipline and pursuing research in that area and willingness to help colleagues in identifying areas of research and proposal development" }
    ]
  },
  {
    category: "Professional Competency",
    criteria: [
      { id: 8, text: "Guidance and counseling role to students" },
      { id: 9, text: "Contributing constructive ideas and activities that improve the teaching learning process" },
      { id: 10, text: "Participation in problem identification and solving at department/college/institution" },
      { id: 11, text: "Participation in Comprehensive Continuous Professional Development / CCPD, HDP, ELIP" },
      { id: 12, text: "Willingness to actively participate in cooperative learning and team teaching activities and preparedness to implement change tools" }
    ]
  },
  {
    category: "Ethical Competency",
    criteria: [
      { id: 13, text: "Willingness to participate and level of commitment in committee works" },
      { id: 14, text: "Willingness to share university resources with other colleagues" },
      { id: 15, text: "Showing cordiality to others, respecting ideas of others" },
      { id: 16, text: "Having positive attitude to work with others (team spirit)" },
      { id: 17, text: "Level of respect to rules, regulations and guidelines of the institution" },
      { id: 18, text: "His/her discipline (dressing, addictions, personality etc...)" }
    ]
  },
  {
    category: "Time Management",
    criteria: [
      { id: 19, text: "Time management in department affairs and in teaching learning activities" },
      { id: 20, text: "Time utilization for consultation hours" }
    ]
  }
];

const SCORE_LABELS = {
  0: "Poor",
  1: "Below Average",
  2: "Average",
  3: "Good",
  4: "Very Good",
  5: "Excellent"
};

export default function EvaluationBreakdownModal({
  open,
  onClose,
  instructorName,
  criteriaScores = {},
  totalScore = 0,
  onEdit,
  submittedDate = null
}) {
  const [expandedCategory, setExpandedCategory] = React.useState(0);

  if (!open) return null;

  const calculateCategoryScore = (categoryIndex) => {
    const category = EVALUATION_CATEGORIES[categoryIndex];
    const categoryScores = category.criteria
      .map(c => criteriaScores[c.id] || 0)
      .filter(score => score > 0);
    
    if (categoryScores.length === 0) return 0;
    return (categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length).toFixed(2);
  };

  const calculateCategoryMaxScore = (categoryIndex) => {
    return EVALUATION_CATEGORIES[categoryIndex].criteria.length * 5;
  };

  const getCategoryStatus = (categoryIndex) => {
    const allCriteria = EVALUATION_CATEGORIES[categoryIndex].criteria;
    const scoredCriteria = allCriteria.filter(c => criteriaScores[c.id] !== undefined);
    return scoredCriteria.length === allCriteria.length;
  };

  const getScoreColor = (score) => {
    if (score <= 1) return 'text-red-600';
    if (score <= 2) return 'text-orange-600';
    if (score <= 3) return 'text-yellow-600';
    if (score <= 4) return 'text-blue-600';
    return 'text-green-600';
  };

  const getTotalScoreColor = (score) => {
    if (score < 40) return 'bg-red-100 text-red-900 border-red-300';
    if (score < 60) return 'bg-orange-100 text-orange-900 border-orange-300';
    if (score < 75) return 'bg-yellow-100 text-yellow-900 border-yellow-300';
    if (score < 90) return 'bg-blue-100 text-blue-900 border-blue-300';
    return 'bg-green-100 text-green-900 border-green-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/40">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl my-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Evaluation Summary</h2>
            <p className="text-sm text-gray-600 mt-1">Instructor: {instructorName}</p>
            {submittedDate && (
              <p className="text-xs text-gray-500 mt-1">
                Submitted: {new Date(submittedDate).toLocaleDateString()} at {new Date(submittedDate).toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="text-2xl">✕</span>
          </button>
        </div>

        {/* Overall Score Card */}
        <div className={`mb-6 p-6 rounded-xl border-2 ${getTotalScoreColor(totalScore)}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold opacity-75">Total Performance Score</p>
              <p className="text-4xl font-bold mt-2">{totalScore.toFixed(1)}/100</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold opacity-75">Performance Level</p>
              <p className="text-2xl font-bold mt-2">
                {totalScore >= 90 ? '⭐⭐⭐⭐⭐ Excellent' :
                 totalScore >= 75 ? '⭐⭐⭐⭐ Very Good' :
                 totalScore >= 60 ? '⭐⭐⭐ Good' :
                 totalScore >= 40 ? '⭐⭐ Needs Improvement' :
                 '⭐ Poor'}
              </p>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Category-wise Breakdown</h3>
          <div className="space-y-3">
            {EVALUATION_CATEGORIES.map((categoryObj, categoryIndex) => {
              const categoryScore = calculateCategoryScore(categoryIndex);
              const maxScore = calculateCategoryMaxScore(categoryIndex);
              const isComplete = getCategoryStatus(categoryIndex);

              return (
                <div key={categoryIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => setExpandedCategory(expandedCategory === categoryIndex ? -1 : categoryIndex)}
                    className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="font-semibold text-gray-900">{categoryObj.category}</span>
                      {isComplete ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Complete</span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Incomplete</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className={`text-lg font-bold ${getScoreColor(categoryScore)}`}>
                          {categoryScore}/5
                        </p>
                        <p className="text-xs text-gray-500">({(categoryScore / 5 * 100).toFixed(0)}%)</p>
                      </div>
                      <span className="text-gray-500">
                        {expandedCategory === categoryIndex ? <FaChevronUp /> : <FaChevronDown />}
                      </span>
                    </div>
                  </button>

                  {/* Category Details */}
                  {expandedCategory === categoryIndex && (
                    <div className="p-4 space-y-3 bg-white">
                      {categoryObj.criteria.map((criterion) => (
                        <div key={criterion.id} className="border-l-4 border-gray-200 pl-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-start gap-2">
                                <span className="inline-block w-6 h-6 rounded-full bg-gray-200 text-gray-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {criterion.id}
                                </span>
                                <p className="text-sm text-gray-700">{criterion.text}</p>
                              </div>
                            </div>
                            {criteriaScores[criterion.id] !== undefined && (
                              <div className="ml-4 text-right flex-shrink-0">
                                <p className={`text-lg font-bold ${getScoreColor(criteriaScores[criterion.id])}`}>
                                  {criteriaScores[criterion.id]}/5
                                </p>
                                <p className="text-xs text-gray-500">
                                  {SCORE_LABELS[criteriaScores[criterion.id]]}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Total Criteria</p>
            <p className="text-2xl font-bold text-blue-600">20</p>
          </div>
          <div className="p-4 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Criteria Scored</p>
            <p className="text-2xl font-bold text-green-600">{Object.keys(criteriaScores).length}</p>
          </div>
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Avg Score (5-point)</p>
            <p className="text-2xl font-bold text-purple-600">
              {(totalScore / 20).toFixed(2)}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-xs text-gray-600 uppercase font-semibold">Completion</p>
            <p className="text-2xl font-bold text-orange-600">
              {Object.keys(criteriaScores).length === 20 ? '100%' : '⚠️'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-6 py-2 rounded-lg bg-ieps-blue-600 text-white font-semibold hover:bg-ieps-blue-700 transition-colors"
            >
              Edit Evaluation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
