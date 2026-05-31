import axios, { AxiosInstance } from 'axios';

export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL: `${baseURL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setAuthToken(token: string | null) {
    this.token = token;
  }

  async request(method: string, endpoint: string, data?: any) {
    const response = await this.client.request({
      method,
      url: endpoint,
      data,
    });
    return response.data;
  }

  // Auth
  async login(username: string, password: string) {
    return this.request('POST', '/auth/login', { username, password });
  }

  async getMe() {
    return this.request('GET', '/auth/me');
  }

  // Jobs
  async getJobs(params?: any) {
    const query = new URLSearchParams(params).toString();
    return this.request('GET', `/jobs${query ? '?' + query : ''}`);
  }

  async approveJob(jobId: number) {
    return this.request('PATCH', `/jobs/${jobId}/approve`);
  }

  async rejectJob(jobId: number, reason: string) {
    return this.request('PATCH', `/jobs/${jobId}/reject`, { reason });
  }

  // Files
  async uploadFile(filePath: string) {
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    
    const response = await this.client.post('/files/upload', form, {
      headers: form.getHeaders(),
    });
    return response.data;
  }

  async downloadFile(fileId: number, savePath: string) {
    const response = await this.client.get(`/files/${fileId}`, {
      responseType: 'stream',
    });
    
    const fs = require('fs');
    const writer = fs.createWriteStream(savePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  // Printers
  async getPrinters() {
    return this.request('GET', '/printers');
  }

  async updatePrinterStatus(printerId: number, status: string) {
    return this.request('PATCH', `/printers/${printerId}/status`, { status });
  }

  // Queue
  async optimizeQueue() {
    return this.request('POST', '/queue/optimize');
  }

  async getSchedule() {
    return this.request('GET', '/queue/schedule');
  }
}
