import { createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  role: null,
  isFirstLogin: false,
  isAuthenticated: false,
  isAuthLoading: false,
  accounts: [],
  login: () => null,
  logout: () => {},
  registerUser: () => false,
  updateUser: () => false,
});
