import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, User } from '@/lib/api';
import { initializeWebSocket, disconnectWebSocket, subscribeToEvent } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isOperator: boolean;
  isAdmin: boolean;
  isOrgAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        initializeWebSocket(token);
      } catch (error) {
        console.error('Failed to parse saved user:', error);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // Real-time print notifications for the signed-in user.
  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribeCompleted = subscribeToEvent('job:completed', (event: any) => {
      if (event.userId === user.id) {
        toast({
          title: 'Your print is finished!',
          description: `"${event.jobName || `Job #${event.jobId}`}" has completed and is ready for pickup.`,
        });
      } else if (user.role !== 'student') {
        toast({
          title: 'Print completed',
          description: `Job "${event.jobName || `#${event.jobId}`}" finished${event.printerName ? ` on ${event.printerName}` : ''}.`,
        });
      }
    });

    const unsubscribeApproved = subscribeToEvent('job:approved', (event: any) => {
      if (event.userId === user.id) {
        toast({
          title: 'Print approved',
          description: 'Your print job was approved and will be scheduled.',
        });
      }
    });

    const unsubscribeUpdated = subscribeToEvent('job:updated', (event: any) => {
      if (event.userId === user.id && event.status === 'rejected') {
        toast({
          title: 'Print rejected',
          description: 'Your print job was rejected. Check the job notes for details.',
          variant: 'destructive',
        });
      }
      if (event.userId === user.id && event.status === 'printing') {
        toast({
          title: 'Print started',
          description: 'Your print job is now printing.',
        });
      }
    });

    return () => {
      unsubscribeCompleted();
      unsubscribeApproved();
      unsubscribeUpdated();
    };
  }, [user, toast]);

  const login = async (username: string, password: string) => {
    try {
      const response = await authApi.login({ username, password });
      const { token, user } = response.data;
      
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
      
      initializeWebSocket(token);
      
      toast({
        title: 'Login successful',
        description: `Welcome back, ${user.username}!`,
      });
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Unable to reach the backend API';
      toast({
        title: 'Login failed',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      const response = await authApi.register({ username, email, password });
      const { token, user } = response.data;
      
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setUser(user);
      
      initializeWebSocket(token);
      
      toast({
        title: 'Registration successful',
        description: `Welcome, ${user.username}!`,
      });
    } catch (error: any) {
      const message = error.response?.data?.error || error.message || 'Unable to reach the backend API';
      toast({
        title: 'Registration failed',
        description: message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
    disconnectWebSocket();
    
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully',
    });
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isOperator: user?.role === 'operator' || user?.role === 'admin',
    isAdmin: user?.role === 'admin',
    isOrgAdmin: user?.isOrgAdmin || user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
