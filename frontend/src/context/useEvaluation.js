import { useContext } from 'react';
import { EvaluationContext } from './EvaluationContextValue';

export const useEvaluation = () => useContext(EvaluationContext);
