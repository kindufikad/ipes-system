import { useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { LanguageContext } from '../context/LanguageContext';
import { ratings } from './evaluationRatings';
import { criteriaApi, evaluationApi } from '../services/api';
import LanguageToggle from './LanguageToggle';
import { getQuestionText, groupCriteriaByCategory } from '../utils/evaluationCriteria';

const EvaluationWorkflow = ({ instructors = [], courses = [], assignments = [], initialAssignmentId = '' }) => {
  const { strings } = useContext(LanguageContext);
  const [formData, setFormData] = useState({
    assignmentId: '',
    instructorId: '',
    courseId: '',
    academicYear: '2016 E.C / 2024',
    semester: 'I',
    responses: {},
    strengths: '',
    improvements: '',
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [criteriaLanguage, setCriteriaLanguage] = useState('en');
  const [criteria, setCriteria] = useState([]);

  useEffect(() => {
    criteriaApi.get('student').then((rows) => setCriteria(Array.isArray(rows) ? rows : [])).catch(() => setCriteria([]));
  }, []);

  const selectedAssignment = useMemo(() => {
    return assignments.find((assignment) => String(assignment.id) === String(formData.assignmentId)) || null;
  }, [formData.assignmentId, assignments]);

  useEffect(() => {
    if (!initialAssignmentId) return;
    const assignment = assignments.find((assignment) => String(assignment.id) === String(initialAssignmentId));
    if (!assignment) return;
    setFormData((prev) => ({
      ...prev,
      assignmentId: String(assignment.id),
      instructorId: String(assignment.instructor_id || prev.instructorId || ''),
      courseId: String(assignment.course_id || prev.courseId || ''),
    }));
  }, [assignments, initialAssignmentId]);

  const selectedInstructor = useMemo(() => {
    if (selectedAssignment) {
      return instructors.find((instructor) => String(instructor.id) === String(selectedAssignment.instructor_id)) || null;
    }
    return instructors.find((instructor) => String(instructor.id) === String(formData.instructorId)) || null;
  }, [formData.instructorId, instructors, selectedAssignment]);

  const selectedCourse = useMemo(() => {
    if (selectedAssignment) {
      return courses.find((course) => String(course.id) === String(selectedAssignment.course_id)) || null;
    }
    return courses.find((course) => String(course.id) === String(formData.courseId)) || null;
  }, [formData.courseId, courses, selectedAssignment]);

  const totalPoints = useMemo(() => {
    return Object.values(formData.responses).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [formData.responses]);

  const criteriaSections = useMemo(() => groupCriteriaByCategory(criteria), [criteria]);
  const totalCriteria = criteria.length;
  const maxPossibleScore = totalCriteria * 5;
  const averageScore = maxPossibleScore ? (totalPoints / maxPossibleScore) * 100 : 0;
  const finalContribution = averageScore * 0.35;
  const completion = totalCriteria ? Math.min(100, Math.round((Object.keys(formData.responses).length / totalCriteria) * 100)) : 0;

  const handleFieldChange = (field, value) => {
    setFormData((prev) => {
      if (field === 'assignmentId') {
        const assignment = assignments.find((assignment) => String(assignment.id) === String(value));
        return {
          ...prev,
          assignmentId: value,
          instructorId: assignment ? String(assignment.instructor_id) : '',
          courseId: assignment ? String(assignment.course_id) : '',
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleRatingChange = (questionId, value) => {
    setFormData((prev) => ({ ...prev, responses: { ...prev.responses, [questionId]: value } }));
  };

  const handleSaveDraft = (event) => {
    event.preventDefault();
    setStatusMessage(strings.evaluationForm.draftSaved);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const assignmentId = selectedAssignment?.id || formData.assignmentId;
    if (!assignmentId) {
      toast.error(strings.evaluationForm.selectAssignment || 'Please select an assignment.');
      return;
    }

    const rawScore = totalPoints;
    const maxScore = maxPossibleScore;
    const scoreOutOfThirty = maxScore ? Math.round((rawScore / maxScore) * 30) : 0;

    try {
      await evaluationApi.submitEvaluation({
        assignment_id: assignmentId,
        score: scoreOutOfThirty,
        feedback: formData.improvements || '',
        status: 'submitted',
      });
      setStatusMessage(strings.evaluationForm.submitted);
      toast.success(strings.evaluationForm.submittedSuccessfully || 'Evaluation submitted successfully.');
      setFormData((prev) => ({
        ...prev,
        responses: {},
        strengths: '',
        improvements: '',
      }));
    } catch (error) {
      console.error('Unable to submit instructor evaluation:', error);
      toast.error(error.message || strings.evaluationForm.submitFailed || 'Unable to submit evaluation.');
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="rounded-3xl bg-ieps-blue-600 px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-ieps-gold-200">{strings.evaluationForm.title}</p>
              <h2 className="mt-2 text-2xl font-semibold">{strings.evaluationForm.subtitle}</h2>
              <p className="mt-2 text-sm text-white/80">{strings.evaluationForm.subSubtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <LanguageToggle language={criteriaLanguage} onChange={setCriteriaLanguage} />
              <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ieps-blue-700">
                {strings.evaluationForm.currentScore}: {averageScore.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-lg font-semibold text-gray-800">{strings.evaluationForm.selectionHeader}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {assignments.length > 0 ? (
                <label className="text-sm text-gray-700 md:col-span-2">
                <span className="mb-1 block font-medium">{strings.evaluationForm.assignmentSelection || 'Assigned instructor'}</span>
                <select
                  value={formData.assignmentId}
                  onChange={(event) => handleFieldChange('assignmentId', event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2"
                  required
                >
                  <option value="">Select an assigned instructor</option>
                  {assignments.map((assignment) => {
                    const course = courses.find((course) => String(course.id) === String(assignment.course_id));
                    const instructor = instructors.find((ins) => String(ins.id) === String(assignment.instructor_id));
                    return (
                      <option key={assignment.id} value={assignment.id}>
                        {instructor?.fullName || assignment.instructor_name || 'Instructor'} - {course ? course.name : assignment.course_name} (Section {assignment.section || 'N/A'})
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{strings.evaluationForm.instructorName}</span>
              <select
                value={formData.instructorId}
                onChange={(event) => handleFieldChange('instructorId', event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2"
                required
                disabled={Boolean(assignments.length)}
              >
                <option value="">{strings.evaluationForm.selectInstructor}</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>{instructor.fullName || instructor.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{strings.evaluationForm.courseAssigned}</span>
              <select
                value={formData.courseId}
                onChange={(event) => handleFieldChange('courseId', event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2"
                required
                disabled={Boolean(assignments.length)}
              >
                <option value="">{strings.evaluationForm.selectCourse}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.code} · {course.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">{strings.evaluationForm.academicYear}</span>
              <input type="text" value={formData.academicYear} onChange={(event) => handleFieldChange('academicYear', event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2" placeholder="e.g. 2016 E.C / 2024" required />
            </label>

              <label className="text-sm text-gray-700">
                <span className="mb-1 block font-medium">{strings.evaluationForm.semester}</span>
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
                <h3 className="text-lg font-semibold text-gray-800">{strings.evaluationForm.evaluationMatrix}</h3>
                <p className="text-sm text-gray-500">{strings.evaluationForm.rateInstructions}</p>
              </div>
              <div className="rounded-full bg-ieps-blue-50 px-3 py-2 text-sm font-semibold text-ieps-blue-700">
                {strings.evaluationForm.rawScore}: {totalPoints} / {maxPossibleScore}
              </div>
            </div>

            <div className="space-y-5">
              {criteriaSections.map((section) => (
                <div key={section.category} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="font-semibold text-ieps-blue-700">{section.category}</h4>
                  <div className="mt-3 space-y-3">
                    {section.criteria.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <p className="text-sm text-gray-700">{getQuestionText(item, criteriaLanguage)}</p>
                          <div className="flex flex-wrap gap-2">
                            {ratings.map((rating) => (
                              <label key={rating.value} className={`rounded-full border px-3 py-1 text-sm ${formData.responses[item.id] === rating.value ? 'border-ieps-blue-600 bg-ieps-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
                                <input
                                  type="radio"
                                  name={item.id}
                                  value={rating.value}
                                  checked={formData.responses[item.id] === rating.value}
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-gray-200 bg-white p-4">
              <label className="block text-sm font-semibold text-gray-800">
                {strings.evaluationForm.strongPoints}
              </label>
              <textarea
                rows={5}
                value={formData.strengths}
                onChange={(event) => handleFieldChange('strengths', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm"
                placeholder={strings.evaluationForm.strongPointsPlaceholder}
              />
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-4">
              <label className="block text-sm font-semibold text-gray-800">
                {strings.evaluationForm.improvements}
              </label>
              <textarea
                rows={5}
                value={formData.improvements}
                onChange={(event) => handleFieldChange('improvements', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm"
                placeholder={strings.evaluationForm.improvementsPlaceholder}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-ieps-blue-50 p-4 text-sm text-gray-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-ieps-blue-700">{strings.evaluationForm.scoreSummary}</p>
                <p>{strings.evaluationForm.averageScore}: {averageScore.toFixed(1)}%</p>
                <p>{strings.evaluationForm.finalContribution}: {finalContribution.toFixed(1)}%</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleSaveDraft} className="rounded-full border border-ieps-blue-300 px-4 py-2 text-sm font-semibold text-ieps-blue-700">
                  {strings.evaluationForm.saveDraft}
                </button>
                <button type="submit" className="rounded-full bg-ieps-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  {strings.evaluationForm.submitEvaluation}
                </button>
              </div>
            </div>
            {statusMessage ? <p className="mt-3 text-sm text-ieps-blue-700">{statusMessage}</p> : null}
          </div>
        </form>
      </section>

      <aside className="space-y-6">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800">{strings.evaluationForm.summaryView}</h3>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl bg-ieps-blue-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{strings.evaluationForm.completion}</span>
                <span className="font-semibold text-ieps-blue-700">{completion}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white">
                <div className="h-2 rounded-full bg-ieps-blue-600" style={{ width: `${completion}%` }} />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{strings.evaluationForm.selectedInstructor}</p>
              <p className="mt-1 font-semibold text-gray-800">{selectedInstructor ? selectedInstructor.fullName : strings.evaluationForm.notSelected}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{strings.evaluationForm.assignedCourse}</p>
              <p className="mt-1 font-semibold text-gray-800">{selectedCourse ? `${selectedCourse.code} · ${selectedCourse.name}` : strings.evaluationForm.notSelected}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">{strings.evaluationForm.currentScore}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{averageScore.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800">{strings.evaluationForm.evaluationNotes}</h3>
          <ul className="mt-4 space-y-3 text-sm text-gray-600">
            <li>• {strings.evaluationForm.noteUseScoreSummary}</li>
            <li>• {strings.evaluationForm.noteSummaryUpdates}</li>
            <li>• {strings.evaluationForm.noteSubmitSatisfied}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
};

export default EvaluationWorkflow;
