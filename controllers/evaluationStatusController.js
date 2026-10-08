const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDisplayDate = (value) => {
  const date = toDate(value);
  if (!date) return 'Not set';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getEvaluationStatus = ({
  deadlineDate,
  isPublished = false,
  isArchived = false,
  now = new Date(),
}) => {
  const deadline = toDate(deadlineDate);
  const hasDeadline = Boolean(deadline);
  const expired = Boolean(hasDeadline && now > deadline);

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

const syncEvaluationStatus = (forms = [], now = new Date()) => forms.map((form) => ({
  ...form,
  ...getEvaluationStatus({
    deadlineDate: form.deadline_date || form.academicTermDeadline || form.deadlineAt || form.deadline,
    isPublished: Boolean(form.is_published ?? form.isPublished ?? form.published ?? false),
    isArchived: Boolean(form.is_archived ?? form.archived ?? false),
    now,
  }),
}));

const autoExpireExpiredForms = async (pool, tableName = 'evaluation_forms') => {
  const [result] = await pool.query(
    `UPDATE ${tableName}
     SET is_published = 0,
         status = 'expired',
         updated_at = CURRENT_TIMESTAMP
     WHERE is_published = 1
       AND deadline_date IS NOT NULL
       AND deadline_date < NOW()`
  );

  return {
    success: true,
    expiredCount: result.affectedRows || 0,
  };
};

const shouldDisableSubmission = (deadlineDate, now = new Date()) => {
  const deadline = toDate(deadlineDate);
  return Boolean(deadline && now > deadline);
};

module.exports = {
  autoExpireExpiredForms,
  formatDisplayDate,
  getEvaluationStatus,
  shouldDisableSubmission,
  syncEvaluationStatus,
  toDate,
};
