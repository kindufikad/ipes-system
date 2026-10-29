import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { AuthContext } from './authContextStore';

const getRoleValues = (value) => (Array.isArray(value) ? value : [value])
  .flatMap((role) => String(role || '').split(/[;,|]+/))
  .map((role) => String(role || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  .filter(Boolean);

const normalizeRole = (value) => {
  const normalizedValue = getRoleValues(value)[0] || '';
  if (['depthead', 'departmenthead', 'head'].includes(normalizedValue)) return 'depthead';
  if (['systemadmin', 'admin'].includes(normalizedValue)) return 'systemadmin';
  if (['collegedean', 'dean'].includes(normalizedValue)) return 'college_dean';
  if (['academicdirectorate', 'academicdirector', 'directorate'].includes(normalizedValue)) return 'academic_directorate';
  if (['academicvicepresident', 'vicepresident'].includes(normalizedValue)) return 'academic_vice_president';
  if (normalizedValue === 'labassistant') return 'lab_assistant';
  if (['instructor', 'teacher'].includes(normalizedValue)) return 'instructor';
  return 'student';
};

const normalizeRoles = (value) => [...new Set(getRoleValues(value).map(normalizeRole))];

const normalizeProfilePhoto = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('data:')) {
    return candidate;
  }
  if (candidate.startsWith('/')) {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${candidate}`;
    }
    return candidate;
  }
  return candidate;
};

const readStoredAuth = () => {
  if (typeof window === 'undefined') return { token: null, user: null, role: null };

  try {
    const token = window.localStorage.getItem('ipesAuthToken') || window.localStorage.getItem('token');
    const role = normalizeRole(window.localStorage.getItem('role'));
    const storedUser = window.localStorage.getItem('user') || window.localStorage.getItem('userData');
    if (!token || !storedUser) return { token, user: null, role };

    const parsedUser = JSON.parse(storedUser);
    if (!parsedUser || typeof parsedUser !== 'object') return { token, user: null, role };

    const roles = normalizeRoles(parsedUser.roles || parsedUser.role || role);
    const normalizedRole = normalizeRole(parsedUser.role || roles[0] || role);
    const photo = normalizeProfilePhoto(parsedUser.profile_photo || parsedUser.profile_picture || parsedUser.avatar);
    const name = parsedUser.full_name
      || parsedUser.name
      || `${parsedUser.first_name || ''} ${parsedUser.last_name || ''}`.trim()
      || parsedUser.username;
    return {
      token,
      role: normalizedRole,
      user: name ? {
        ...parsedUser,
        name,
        role: normalizedRole,
        roles,
        profile_photo: photo,
        profile_picture: photo,
        avatar: photo,
        isFirstLogin: Boolean(parsedUser.isFirstLogin ?? parsedUser.is_first_login ?? false),
      } : null,
    };
  } catch {
    return { token: null, user: null, role: null };
  }
};

export const AuthProvider = ({ children }) => {
  const [initialAuth] = useState(readStoredAuth);
  const [session, setSession] = useState(initialAuth.user);
  const [isAuthLoading, setIsAuthLoading] = useState(Boolean(initialAuth.token));
  const [authToken, setAuthToken] = useState(initialAuth.token);
  const [role, setRole] = useState(initialAuth.role);

  const [accounts, setAccounts] = useState([]);

  const navigate = useNavigate();
  const user = session?.name ? session : null;
  const userRole = session?.role || role || null;
  const isFirstLogin = Boolean(session?.isFirstLogin ?? session?.is_first_login ?? false);

  useEffect(() => {
    if (!authToken) {
      setSession(null);
      setRole(null);
      setIsAuthLoading(false);
      return;
    }

    const loadUserProfile = async () => {
      try {
        const profile = await authApi.me();
        const profilePhoto = normalizeProfilePhoto(profile.profile_photo || profile.profile_picture || profile.avatar);
        const normalizedRoles = normalizeRoles(profile.roles || profile.role);
        const normalizedProfileRole = normalizeRole(profile.role || normalizedRoles[0]);
        const hydratedUser = {
          ...profile,
          name: profile.full_name || profile.name || profile.username,
          username: profile.username || profile.email,
          role: normalizedProfileRole,
          roles: normalizedRoles,
          profile_photo: profilePhoto,
          profile_picture: profilePhoto,
          avatar: profilePhoto,
          isFirstLogin: Boolean(profile.isFirstLogin ?? profile.is_first_login ?? false),
        };
        setSession(hydratedUser);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('user', JSON.stringify(hydratedUser));
          window.localStorage.setItem('userData', JSON.stringify(hydratedUser));
        }
        setRole(normalizedProfileRole);
      } catch {
        setAuthToken(null);
        setRole(null);
        setSession(null);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('user');
          window.localStorage.removeItem('userData');
        }
      } finally {
        setIsAuthLoading(false);
      }
    };

    loadUserProfile();
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authToken) {
      window.localStorage.setItem('ipesAuthToken', authToken);
      window.localStorage.setItem('token', authToken);
    } else {
      window.localStorage.removeItem('ipesAuthToken');
      window.localStorage.removeItem('token');
    }
  }, [authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (role) {
      window.localStorage.setItem('role', role);
    } else {
      window.localStorage.removeItem('role');
    }
  }, [role]);

  const login = (username, password) => {
    const normalizedUsername = username.trim().toLowerCase();
    const account = accounts.find(
      (acct) => acct.username.trim().toLowerCase() === normalizedUsername && acct.password === password
    );

    if (!account) {
      return null;
    }

    const normalizedRole = normalizeRole(account.role);
    setSession({
      name: account.name || account.username,
      username: account.username,
      role: normalizedRole,
    });
    setRole(normalizedRole);

    return account;
  };

  const setAuthSession = (token, user) => {
    if (!token || !user) return false;
    const normalizedRoles = normalizeRoles(user.roles || user.role);
    const normalizedRole = normalizeRole(user.role || normalizedRoles[0]);
    const photo = normalizeProfilePhoto(user.profile_photo || user.profile_picture || user.avatar);
    const fullUser = {
      ...user,
      id: user.id ?? user.user_id ?? null,
      username: user.username ?? null,
      first_name: user.first_name || user.firstName || null,
      last_name: user.last_name || user.lastName || null,
      full_name: user.full_name || [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean).join(' ') || user.username || null,
      role: normalizedRole,
      roles: normalizedRoles,
      profile_photo: photo,
      profile_picture: photo,
      avatar: photo,
      isFirstLogin: Boolean(user.isFirstLogin ?? user.is_first_login ?? false),
    };

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ipesAuthToken', token);
      window.localStorage.setItem('token', token);
      window.localStorage.setItem('role', normalizedRole);
      window.localStorage.setItem('user', JSON.stringify(fullUser));
      window.localStorage.setItem('userData', JSON.stringify(fullUser));
    }
    setAuthToken(token);
    setRole(normalizedRole);
    setSession(fullUser);
    return true;
  };

  const updateUser = (updates) => {
    if (!session || !updates || typeof updates !== 'object') return false;
    const photo = normalizeProfilePhoto(updates.profile_photo || updates.profile_picture || updates.avatar || session.profile_photo || session.profile_picture || session.avatar);
    const updatedUser = {
      ...session,
      ...updates,
      profile_photo: photo,
      profile_picture: photo,
      avatar: photo,
    };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('user', JSON.stringify(updatedUser));
      window.localStorage.setItem('userData', JSON.stringify(updatedUser));
    }
    setSession(updatedUser);
    return true;
  };

  const registerUser = (newAccount) => {
    const username = (newAccount.username || '').trim().toLowerCase();
    const email = (newAccount.email || '').trim().toLowerCase();
    const candidate = username || email;

    if (!candidate) {
      return false;
    }

    const alreadyExists = accounts.some((acct) => {
      const acctUsername = (acct.username || '').trim().toLowerCase();
      const acctEmail = (acct.email || '').trim().toLowerCase();
      return acctUsername === candidate || acctEmail === candidate;
    });

    if (alreadyExists) {
      return false;
    }

    setAccounts((current) => [
      ...current,
      {
        ...newAccount,
        username: username || email,
        email: email || undefined,
      },
    ]);

    return true;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.warn('Logout request failed:', error?.message || error);
    }

    if (typeof window !== 'undefined') {
      const keysToClear = ['isLoggedIn', 'userData', 'user', 'ipesAuthToken', 'token', 'role'];
      keysToClear.forEach((key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      });
    }

    setSession(null);
    setAuthToken(null);
    setRole(null);
    navigate('/login', { replace: true });
  };

  const value = useMemo(
    () => ({
      user,
      role: userRole,
      accounts,
      authToken,
      isAuthenticated: Boolean(session),
      isAuthLoading,
      isFirstLogin,
      login,
      logout,
      registerUser,
      setAuthSession,
      updateUser,
    }),
    [authToken, userRole, user, accounts, isFirstLogin, isAuthLoading, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
