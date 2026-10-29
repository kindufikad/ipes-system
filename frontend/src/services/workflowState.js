export const WORKFLOW_UPDATED_EVENT = 'ipes-evaluation-workflow-updated';

let workflowState = [];

export const readWorkflowState = () => workflowState;

export const persistWorkflowState = (items) => {
  workflowState = Array.isArray(items) ? items : [];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKFLOW_UPDATED_EVENT, { detail: workflowState }));
  }
  return workflowState;
};

export const dispatchWorkflowTask = (task) => {
  const items = [task, ...readWorkflowState()];
  return persistWorkflowState(items);
};

export const updateWorkflowTask = (taskId, updates) => {
  const items = readWorkflowState().map((item) =>
    item.id === taskId
      ? {
          ...item,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
      : item
  );
  return persistWorkflowState(items);
};

export const completeWorkflowTask = (taskId, payload = {}) => {
  return updateWorkflowTask(taskId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    ...payload,
  });
};

export const getWorkflowSnapshot = () => {
  const items = readWorkflowState();
  const completed = items.filter((item) => item.status === 'completed').length;
  const pending = items.filter((item) => item.status !== 'completed').length;

  return {
    items,
    completed,
    pending,
    progress: items.length ? Math.round((completed / items.length) * 100) : 0,
  };
};
