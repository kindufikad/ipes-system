import { useMemo, useState, useEffect } from 'react';
import { criteriaApi } from '../services/api';
import LanguageToggle from './LanguageToggle';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';
import { ratings } from './evaluationRatings';

const EvaluationForm = ({ instructors = [], courses = [], isCourseAssigned: isCourseAssignedProp, onAssignCourse }) => {
  const [language, setLanguage] = useState('en');
  const [formData, setFormData] = useState({
    instructorId: '',
    courseId: '',
    academicYear: '2016 E.C / 2024',
    semester: 'I',
    strengths: '',
    improvements: '',
  });
  const [selectedRatings, setSelectedRatings] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isAssigned, setIsAssigned] = useState(true);
  const [criteria, setCriteria] = useState([]);

  useEffect(() => {
    criteriaApi.get('student').then((rows) => {
      setCriteria(Array.isArray(rows) ? rows : []);
    }).catch(() => {});
  }, []);

  const activeCriteria = groupCriteriaByCategory(criteria);

  const totalQuestions = useMemo(() => activeCriteria.reduce((sum, sec) => sum + sec.criteria.length, 0), [activeCriteria]);

  const totalPoints = useMemo(() => Object.values(selectedRatings).reduce((sum, value) => sum + Number(value || 0), 0), [selectedRatings]);

  const maxPossibleScore = totalQuestions * 5;
  const averageScore = maxPossibleScore ? (totalPoints / maxPossibleScore) * 100 : 0;
  const finalContribution = averageScore * 0.35;

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'instructorId' || field === 'courseId') {
      // reset ratings when changing selection
      setSelectedRatings({});
      setAttemptedSubmit(false);
    }
  };
  const handleRatingChange = (questionId, value) => {
    setSelectedRatings((prev) => ({ ...prev, [questionId]: Number(value) }));
  };

  const handleSaveDraft = (event) => {
    event.preventDefault();
    setStatusMessage(language === 'en' ? 'Draft saved locally. You can continue later.' : 'ረቂቅ በአካባቢው ተቀምጧል። በኋላ መቀጠል ይችላሉ።');
  };

  const handleClearForm = () => {
    setSelectedRatings({});
    setFormData((prev) => ({ ...prev, strengths: '', improvements: '' }));
    setAttemptedSubmit(false);
    setStatusMessage('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    // course assignment pre-check
    const instructorId = formData.instructorId;
    const courseId = formData.courseId;
    const assigned = checkIsCourseAssigned(instructorId, courseId);
    setIsAssigned(assigned);
    if (!assigned) {
      setStatusMessage(language === 'en' ? 'No course is assigned to this instructor.' : 'ለዚህ መምህር ኮርስ አይደለም።');
      return;
    }

    if (Object.keys(selectedRatings).length < totalQuestions) {
      setStatusMessage(language === 'en' ? 'Please complete all evaluation items before submitting.' : 'እባክዎን ከሁሉም ግምገማ ነጥቦች በፊት ያስገቡ።');
      return;
    }

    setStatusMessage(language === 'en' ? 'Evaluation submitted successfully.' : 'ግምገማው በተሳካ ሁኔታ ተላልፏል።');
  };

  // helper to check assignment, can be provided by parent via prop
  const checkIsCourseAssigned = (instructorId, courseId) => {
    if (!instructorId || !courseId) return false;
    if (typeof isCourseAssignedProp === 'function') return isCourseAssignedProp(instructorId, courseId);
    const course = courses.find((c) => String(c.id) === String(courseId));
    if (!course) return false;
    // common field names to check
    return Boolean(course.instructorId || course.assignedInstructorId || course.primaryInstructorId);
  };

  useEffect(() => {
    // update assigned state when selection changes
    setIsAssigned(checkIsCourseAssigned(formData.instructorId, formData.courseId));
  }, [formData.instructorId, formData.courseId]);

  const answeredCount = useMemo(() => Object.keys(selectedRatings).length, [selectedRatings]);
  const isComplete = answeredCount >= totalQuestions;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="rounded-3xl bg-ieps-blue-600 px-6 py-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">
              {language === 'en' ? 'Instructor Performance Evaluation' : 'የመምህር አፈፃፀም ግምገማ'}
            </h2>
            <p className="mt-2 text-sm text-white/80">
              {language === 'en'
                ? 'Mekdela Amba University · Target Weight: 30% - 40% of Total Score'
                : 'መቅደላ አምባ ዩኒቨርሲቲ · የአጠቃላይ ነጥብ 30% - 40%'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ieps-blue-700">
              {language === 'en' ? 'Current Score' : 'የአሁኑ ውጤት'}: {averageScore.toFixed(1)}%
            </div>
          </div>
          <LanguageToggle language={language} onChange={setLanguage} />
        </div>
      </div>

      <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
        <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-lg font-semibold text-gray-800">{language === 'en' ? '1. Selection Header' : '1. የመምረጥ ራስጌ'}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{language === 'en' ? 'Instructor Name' : 'የመምህሩ ስም'}</span>
              <select value={formData.instructorId} onChange={(event) => handleFieldChange('instructorId', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2" required>
                <option value="">{language === 'en' ? 'Select instructor' : 'መምህር ምረጥ'}</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>{instructor.fullName || instructor.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{language === 'en' ? 'Course Assigned' : 'የተመደበ ኮርስ'}</span>
              <select value={formData.courseId} onChange={(event) => handleFieldChange('courseId', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2" required>
                <option value="">{language === 'en' ? 'Select course' : 'ኮርስ ምረጥ'}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{language === 'en' ? 'Academic Year' : 'የት/ት ዓመት'}</span>
              <input type="text" value={formData.academicYear} onChange={(event) => handleFieldChange('academicYear', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2" placeholder="e.g. 2016 E.C / 2024" required />
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{language === 'en' ? 'Semester' : 'ሴሚስተር'}</span>
              <select value={formData.semester} onChange={(event) => handleFieldChange('semester', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2" required>
                <option value="I">I</option>
                <option value="II">II</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{language === 'en' ? '2. Evaluation Matrix' : '2. የግምገማ ማትሪክስ'}</h3>
              <p className="text-sm text-gray-500">{language === 'en' ? 'Rate each item from 1 to 5.' : 'እያንዳንዱን ነገር ከ1 እስከ 5 ይመልከቱ።'}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-ieps-blue-50 px-3 py-2 text-sm font-semibold text-ieps-blue-700">{language === 'en' ? 'Raw Score' : 'የመጀመሪያ ውጤት'}: {totalPoints} / {maxPossibleScore}</div>
              <div className="rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700">{language === 'en' ? 'Answered' : 'የተመረጡ'}: {answeredCount} / {totalQuestions}</div>
            </div>
          </div>

          {!isAssigned && formData.instructorId && formData.courseId ? (
            <div className="rounded-2xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
              <div className="flex items-center justify-between">
                <p>⚠️ {language === 'en' ? 'No course assigned. Please assign a course to this instructor before conducting an evaluation.' : 'ለዚህ መምህር ኮርስ አይደለም። ከግምገማ በፊት ኮርስ ይመደብ.'}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => (typeof onAssignCourse === 'function' ? onAssignCourse(formData.instructorId, formData.courseId) : setStatusMessage('Please assign course from the admin panel.'))} className="rounded-xl bg-yellow-600 px-3 py-2 text-sm font-semibold text-white">{language === 'en' ? 'Assign Course Now' : 'አስይዙ ኮርስ'}</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {activeCriteria.map((section) => (
                <div key={section.category} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-semibold text-ieps-blue-700">{section.category}</h4>
                  <div className="mt-3 space-y-3">
                    {section.criteria.map((item) => (
                      <div key={item.id} className={`rounded-2xl border bg-white p-3 ${attemptedSubmit && !selectedRatings[item.id] ? 'border-red-200 ring-1 ring-red-200' : 'border-gray-100'}`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <p className="text-sm text-gray-700">{getQuestionText(item, language)}</p>
                          <div className="flex flex-wrap gap-2">
                            {ratings.map((rating) => (
                              <label key={rating.value} className={`rounded-full border px-3 py-1 text-sm ${selectedRatings[item.id] === Number(rating.value) ? 'border-ieps-blue-600 bg-ieps-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
                                <input
                                  type="radio"
                                  name={item.id}
                                  value={rating.value}
                                  checked={String(selectedRatings[item.id]) === rating.value}
                                  onChange={() => handleRatingChange(item.id, rating.value)}
                                  className="sr-only"
                                />
                                {rating.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-4">
            <label className="block text-sm font-semibold text-gray-800">
              {language === 'en' ? '3. Strong Points' : '3. ጠንካራ ጎኖች'}
            </label>
            <textarea
              rows={5}
              value={formData.strengths}
              onChange={(event) => handleFieldChange('strengths', event.target.value)}
              className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm"
              placeholder={language === 'en' ? 'Write the instructor’s strong points here...' : 'የመምህሩን ጠንካራ ጎኖች እዚህ ይጻፉ...'}
            />
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-4">
            <label className="block text-sm font-semibold text-gray-800">
              {language === 'en' ? '3. Areas for Improvement' : '3. መሻሻል ያለባቸው ነጥቦች'}
            </label>
            <textarea
              rows={5}
              value={formData.improvements}
              onChange={(event) => handleFieldChange('improvements', event.target.value)}
              className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm"
              placeholder={language === 'en' ? 'Write areas where the instructor can improve...' : 'ለመሻሻል የሚያስፈልጉትን ነጥቦች እዚህ ይጻፉ...'}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-ieps-blue-50 p-4 text-sm text-gray-700">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-ieps-blue-700">{language === 'en' ? 'Score Summary' : 'የነጥብ አጠቃላይ'}</p>
              <p>{language === 'en' ? 'Average Score' : 'አማካይ ውጤት'}: {averageScore.toFixed(1)}%</p>
              <p>{language === 'en' ? 'Final Contribution (35% weight)' : 'የመጨረሻ አስተዋጽኦ (35% ክብደት)'}: {finalContribution.toFixed(1)}%</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="w-full">
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-ieps-blue-600" style={{ width: `${Math.round((answeredCount / Math.max(1, totalQuestions)) * 100)}%` }} />
                </div>
                <div className="mt-2 text-right text-xs text-gray-600">{language === 'en' ? `Answered: ${answeredCount} / ${totalQuestions}` : `የተመረጡ: ${answeredCount} / ${totalQuestions}`}</div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleSaveDraft} className="rounded-full border border-ieps-blue-300 px-4 py-2 text-sm font-semibold text-ieps-blue-700">
                  {language === 'en' ? 'Save Draft' : 'ረቂቅ አስቀምጥ'}
                </button>
                <button type="button" onClick={handleClearForm} className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">{language === 'en' ? 'Clear Form' : 'ቅጥር ሰር'}</button>

                <div className="relative group">
                  <button
                    type="submit"
                    disabled={!isComplete || !isAssigned}
                    className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${!isComplete || !isAssigned ? 'bg-gray-300 cursor-not-allowed' : 'bg-ieps-blue-600 hover:bg-ieps-blue-700'}`}>
                    {language === 'en' ? 'Submit Evaluation' : 'ግምገማ አስገባ'}
                  </button>
                  {(!isComplete || !isAssigned) && (
                    <div className="absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-md bg-gray-800 px-3 py-2 text-xs text-white group-hover:block">
                      {(!isComplete && 'Please complete all evaluation items before submitting.') || (!isAssigned && 'Please assign a course to this instructor before submitting.')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {statusMessage ? <p className="mt-3 text-sm text-ieps-blue-700">{statusMessage}</p> : null}
        </div>
      </form>
    </section>
  );
};

export default EvaluationForm;
