import { useEffect, useMemo, useState } from 'react';
import socket from '../services/socketClient';
import { SUBMISSIONS_UPDATED_EVENT } from '../services/formSubmissions';
import { WORKFLOW_UPDATED_EVENT } from '../services/workflowState';
import { useAuth } from './useAuth';
import { EvaluationContext } from './EvaluationContextValue';

export const EvaluationProvider = ({ children }) => {
  const { isAuthenticated, authToken, user, role } = useAuth();
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      if (socket.connected || socket.connecting) socket.disconnect();
      return undefined;
    }

    socket.auth = { token: authToken };
    const joinRooms = () => socket.emit('join_rooms', { userId: user?.id ?? user?.user_id, role });
    const handleEvaluationUpdate = (update) => {
      setLastUpdate(update || { type: 'evaluation-updated' });
      setRefreshVersion((version) => version + 1);
      window.dispatchEvent(new CustomEvent(SUBMISSIONS_UPDATED_EVENT, { detail: update || {} }));
      window.dispatchEvent(new CustomEvent(WORKFLOW_UPDATED_EVENT, { detail: update || {} }));
    };

    socket.on('connect', joinRooms);
    socket.on('evaluation_updated', handleEvaluationUpdate);
    if (!socket.connected && !socket.connecting) socket.connect();
    if (socket.connected) joinRooms();
    return () => {
      socket.off('connect', joinRooms);
      socket.off('evaluation_updated', handleEvaluationUpdate);
    };
  }, [authToken, isAuthenticated, role, user?.id, user?.user_id]);

  const value = useMemo(() => ({ lastUpdate, refreshVersion }), [lastUpdate, refreshVersion]);
  return <EvaluationContext.Provider value={value}>{children}</EvaluationContext.Provider>;
};

