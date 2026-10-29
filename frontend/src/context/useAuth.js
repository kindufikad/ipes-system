import { useContext } from 'react';
import { AuthContext } from './authContextStore';

export const useAuth = () => useContext(AuthContext);
