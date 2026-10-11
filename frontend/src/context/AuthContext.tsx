import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, MeResponse } from '../types';
import { apiFetch, getAccessToken, setAccessToken, refreshAuthToken } from '../lib/api';

interface AuthContextType {
  user: User | null;
  me: MeResponse | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiFetch<MeResponse>('/me');
      setMe(data);
      setUser({ id: data.id, email: data.email, role: data.role });
    } catch {
      // Ignore profile fetch failure
    }
  }, []);

  const login = useCallback((token: string, userData: User) => {
    setAccessToken(token);
    setUser(userData);
    window.dispatchEvent(new CustomEvent('auth:login'));
    refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout error
    } finally {
      setAccessToken(null);
      setUser(null);
      setMe(null);
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = await refreshAuthToken();
        if (token) {
          window.dispatchEvent(new CustomEvent('auth:login'));
          await refreshMe();
        }
      } catch {
        // Not logged in
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const handleUnauthorized = () => {
      setUser(null);
      setMe(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [refreshMe]);

  return (
    <AuthContext.Provider value={{ user, me, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
