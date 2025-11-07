import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 5000
});

export const businessTypeService = {
  getAll: () => api.get('/business-types')
};

// 票号服务
export const ticketService = {
  create: (businessTypeId) => api.post('/tickets', { businessTypeId }),
  getWaitingCount: (businessTypeId) => api.get(`/tickets/waiting/${businessTypeId}`),
  getCurrent: () => Promise.resolve({ data: [] }),
  getWaitingCounts: () => Promise.resolve({ data: [] }),
  updateStatus: () => Promise.reject({ response: { data: { message: '此功能已不可用', code: 'SERVICE_REMOVED' } } })
};

export const counterService = {
  getAll: () => api.get('/counters'),
  update: (id, data) => api.put(`/counters/${id}`, data),
  // 叫号功能已移除
  callNext: () => Promise.reject({ response: { data: { message: '此功能已不可用', code: 'SERVICE_REMOVED' } } }),
  callManual: () => Promise.reject({ response: { data: { message: '此功能已不可用', code: 'SERVICE_REMOVED' } } }),
  endService: (id) => api.post(`/counters/${id}/end-service`),
  getClientIP: () => api.get('/client-ip')
};

// 添加管理员API接口
export const adminService = {
  login: (password) => api.post('/admin-system/login', { password }),
  getSettings: (token) => api.get('/admin-system/settings', { 
    headers: { 'Admin-Token': token } 
  }),
  updateSetting: (key, data, token) => api.put(`/admin-system/settings/${key}`, data, {
    headers: { 'Admin-Token': token }
  }),
  changePassword: (data, token) => api.post('/admin-system/change-password', data, {
    headers: { 'Admin-Token': token }
  }),
  getDevices: (token) => api.get('/admin-system/devices', {
    headers: { 'Admin-Token': token }
  }),
  createDevice: (data, token) => api.post('/admin-system/devices', data, {
    headers: { 'Admin-Token': token }
  }),
  updateDevice: (id, data, token) => api.put(`/admin-system/devices/${id}`, data, {
    headers: { 'Admin-Token': token }
  }),
  deleteDevice: (id, token) => api.delete(`/admin-system/devices/${id}`, {
    headers: { 'Admin-Token': token }
  }),
  bindDevice: (deviceId, counterId, token) => api.post(`/admin-system/devices/${deviceId}/bind/${counterId}`, {}, {
    headers: { 'Admin-Token': token }
  }),
  unbindDevice: (deviceId, token) => api.post(`/admin-system/devices/${deviceId}/unbind`, {}, {
    headers: { 'Admin-Token': token }
  }),
  getCounters: (token) => api.get('/admin-system/counters', {
    headers: { 'Admin-Token': token }
  }),
  createCounter: (data, token) => api.post('/admin-system/counters', data, {
    headers: { 'Admin-Token': token }
  }),
  updateCounter: (id, data, token) => api.put(`/admin-system/counters/${id}`, data, {
    headers: { 'Admin-Token': token }
  }),
  deleteCounter: (id, token) => api.delete(`/admin-system/counters/${id}`, {
    headers: { 'Admin-Token': token }
  })
};

export default {
  get: api.get,
  post: api.post,
  put: api.put,
  delete: api.delete,
  businessTypeService,
  ticketService,
  counterService,
  adminService
};
