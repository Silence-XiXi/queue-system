import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 5000
});

export const businessTypeService = {
  getAll: () => api.get('/business-types')
};

export const ticketService = {
  create: (businessTypeId) => api.post('/tickets', { businessTypeId }),
  getCurrent: () => api.get('/tickets/current'),
  updateStatus: (id, status) => api.put(`/tickets/${id}/status`, { status })
};

export const counterService = {
  getAll: () => api.get('/counters'),
  update: (id, data) => api.put(`/counters/${id}`, data),
  callNext: (id, businessTypeId) => api.post(`/counters/${id}/next`, { businessTypeId }),
  callManual: (id, ticketNumber) => api.post(`/counters/${id}/call-manual`, { ticketNumber }),
  endService: (id) => api.post(`/counters/${id}/end-service`)
};

export default {
  businessTypeService,
  ticketService,
  counterService
};
