import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'student' | 'operator' | 'admin' | 'org_admin';
  organizationId?: number;
  isOrgAdmin?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Authentication
export const authApi = {
  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data),
  
  register: (data: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register', data),
  
  me: () =>
    api.get<{ user: User }>('/auth/me'),
  
  logout: () =>
    api.post('/auth/logout'),
};

// Printers
export const printersApi = {
  list: () => api.get('/printers'),
  get: (id: number | string) => api.get(`/printers/${id}`),
  create: (data: any) => api.post('/printers', data),
  update: (id: number | string, data: any) => api.patch(`/printers/${id}`, data),
  updateStatus: (id: number | string, status: string) =>
    api.patch(`/printers/${id}/status`, { status }),
  getLiveStatus: (id: number | string) => api.get(`/printers/${id}/status`),
  startPrint: (id: number | string, data: { file_id?: number; job_id?: number }) =>
    api.post(`/printers/${id}/print`, data),
  sendCommand: (id: number | string, command: 'home' | 'preheat' | 'cooldown') =>
    api.post(`/printers/${id}/command`, { command }),
  sendGcode: (id: number | string, gcode: string) =>
    api.post(`/printers/${id}/gcode`, { gcode }),
  getTerminal: (id: number | string) => api.get(`/printers/${id}/terminal`),
  pausePrint: (id: number | string) => api.post(`/printers/${id}/pause`),
  resumePrint: (id: number | string) => api.post(`/printers/${id}/resume`),
  cancelPrint: (id: number | string) => api.post(`/printers/${id}/cancel`),
  getByType: (type: 'fdm' | 'resin') => api.get(`/printers/type/${type}`),
};

// Files
export const filesApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  download: (id: number) => api.get(`/files/${id}`, { responseType: 'blob' }),
  getMetadata: (id: number) => api.get(`/files/${id}/metadata`),
  delete: (id: number) => api.delete(`/files/${id}`),
};

// Jobs
export const jobsApi = {
  list: (params?: { status?: string; user_id?: number }) =>
    api.get('/jobs', { params }),
  get: (id: number) => api.get(`/jobs/${id}`),
  create: (data: any) => api.post('/jobs', data),
  update: (id: number, data: any) => api.patch(`/jobs/${id}`, data),
  delete: (id: number) => api.delete(`/jobs/${id}`),
  approve: (id: number) => api.patch(`/jobs/${id}/approve`),
  reject: (id: number, reason: string) =>
    api.patch(`/jobs/${id}/reject`, { reason }),
};

// Queue
export const queueApi = {
  optimize: () => api.post('/queue/optimize'),
  getSchedule: () => api.get('/queue/schedule'),
  removeFromSchedule: (id: number) => api.delete(`/queue/schedule/${id}`),
  getTimeline: () => api.get('/queue/timeline'),
};

// Work Hours
export const workHoursApi = {
  get: () => api.get('/workhours'),
  update: (data: { start_hour: number; end_hour: number }) =>
    api.put('/workhours', data),
};

// Email
export interface EmailSettings {
  enabled: boolean;
  autoSendOnCompletion: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail?: string;
  fromName?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
}

export const emailApi = {
  getSettings: () => api.get<EmailSettings>('/email/settings'),
  updateSettings: (data: Partial<EmailSettings>) =>
    api.patch('/email/settings', data),
  testEmail: (testEmail: string) =>
    api.post('/email/test', { testEmail }),
  sendJobEmail: (jobId: number) =>
    api.post(`/email/send/${jobId}`),
  getTemplates: () => api.get('/email/templates'),
};
