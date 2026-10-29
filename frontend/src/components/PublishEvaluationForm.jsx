import { useMemo, useState } from 'react';
import './PublishEvaluationForm.css';

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDisplayDate = (value) => {
  const date = normalizeDate(value);
  if (!date) return 'Not set';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getEvaluationStatus = ({ deadlineDate, isPublished = false, isArchived = false, now = new Date() }) => {
  const deadline = normalizeDate(deadlineDate);
  const expired = Boolean(deadline && now > deadline);

  if (isArchived) {
    return {
      status: 'archived',
      label: 'Archived',
      badgeClass: 'soc-badge soc-badge--gray',
      expired: true,
      closed: true,
      isActive: false,
      deadline,
      deadlineText: deadline ? formatDisplayDate(deadline) : 'Not set',
    };
  }

  if (!isPublished) {
    return {
      status: 'draft',
      label: 'Draft / Unpublished',
      badgeClass: 'soc-badge soc-badge--gray',
      expired: false,
      closed: false,
      isActive: false,
      deadline,
      deadlineText: deadline ? formatDisplayDate(deadline) : 'Not set',
    };
  }

  if (expired) {
    return {
      status: 'expired',
      label: 'Expired / Locked',
      badgeClass: 'soc-badge soc-badge--danger',
      expired: true,
      closed: true,
      isActive: false,
      deadline,
      deadlineText: deadline ? formatDisplayDate(deadline) : 'Not set',
    };
  }

  return {
    status: 'published',
    label: 'Active (Published)',
    badgeClass: 'soc-badge soc-badge--success',
    expired: false,
    closed: false,
    isActive: true,
    deadline,
    deadlineText: deadline ? formatDisplayDate(deadline) : 'Not set',
  };
};

const addDays = (dateValue, days) => {
  const date = normalizeDate(dateValue) || new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const PublishEvaluationForm = ({
  title = 'Publish Evaluation Form',
  formId = 'student-evaluation',
  departmentName = 'your department',
  initialStatus = {
    isPublished: true,
    deadlineDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  onPublish = () => {},
  onUnpublish = () => {},
  onExtendDeadline = () => {},
  onSave = () => {},
}) => {
  const [isPublished, setIsPublished] = useState(Boolean(initialStatus.isPublished));
  const [deadlineDate, setDeadlineDate] = useState(initialStatus.deadlineDate || '');
  const [statusMessage, setStatusMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const evaluationStatus = useMemo(
    () => getEvaluationStatus({ deadlineDate, isPublished, now: new Date() }),
    [deadlineDate, isPublished]
  );

  const submissionDisabled = Boolean(evaluationStatus.closed || evaluationStatus.expired);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        formId,
        isPublished,
        deadlineDate,
      });
      setStatusMessage('Evaluation settings saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async (days) => {
    const nextDeadline = addDays(deadlineDate || new Date(), days);
    setDeadlineDate(nextDeadline);
    await onExtendDeadline({ formId, deadlineDate: nextDeadline });
    setIsPublished(true);
    setStatusMessage(`Deadline extended by ${days} day(s).`);
  };

  const handleTogglePublish = async () => {
    if (isPublished) {
      setIsPublished(false);
      await onUnpublish({ formId });
      setStatusMessage('Evaluation unpublished.');
      return;
    }

    setIsPublished(true);
    await onPublish({ formId, deadlineDate });
    setStatusMessage('Evaluation published and active.');
  };

  return (
    <section className="publish-evaluation-form">
      <header className="publish-evaluation-form__header">
        <div>
          <p className="publish-evaluation-form__eyebrow">EVALUATION WORKFLOW</p>
          <h2>{title}</h2>
        </div>
        <span className={evaluationStatus.badgeClass}>{evaluationStatus.label}</span>
      </header>

      <div className="publish-evaluation-form__content">
        <div className="publish-evaluation-form__panel">
          <p className="mb-3 text-sm font-medium text-blue-800">This deadline applies only to {departmentName}.</p>
          <label className="publish-evaluation-form__field">
            <span>Academic Term Deadline</span>
            <input
              type="datetime-local"
              value={deadlineDate ? new Date(deadlineDate).toISOString().slice(0, 16) : ''}
              onChange={(event) => setDeadlineDate(new Date(event.target.value).toISOString())}
            />
          </label>

          <div className="publish-evaluation-form__actions">
            <button type="button" className="soc-button soc-button--primary" onClick={() => void handleTogglePublish()}>
              {isPublished ? 'Unpublish' : 'Publish'}
            </button>
            <button type="button" className="soc-button soc-button--subtle" onClick={() => void handleExtend(3)}>
              +3 Days
            </button>
            <button type="button" className="soc-button soc-button--subtle" onClick={() => void handleExtend(7)}>
              +7 Days
            </button>
            <button type="button" className="soc-button soc-button--subtle" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          <div className="publish-evaluation-form__status-row">
            <div>
              <strong>Current deadline</strong>
              <span>{evaluationStatus.deadlineText}</span>
            </div>
            <div>
              <strong>Status</strong>
              <span>{evaluationStatus.status}</span>
            </div>
          </div>
        </div>

        <div className="publish-evaluation-form__panel publish-evaluation-form__panel--alert">
          <h3>Submission status</h3>
          {submissionDisabled ? (
            <div className="publish-evaluation-form__warning">
              Evaluation Period Expired on {formatDisplayDate(deadlineDate)}. Submissions are closed.
            </div>
          ) : (
            <div className="publish-evaluation-form__info">
              Evaluation Period is active. Students and peers may submit before the deadline.
            </div>
          )}
        </div>
      </div>

      {statusMessage && <div className="publish-evaluation-form__toast">{statusMessage}</div>}
    </section>
  );
};

export default PublishEvaluationForm;
