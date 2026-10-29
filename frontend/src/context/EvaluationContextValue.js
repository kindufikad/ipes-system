import { createContext } from 'react';

export const EvaluationContext = createContext({
  lastUpdate: null,
  refreshVersion: 0,
});