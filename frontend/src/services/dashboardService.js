import api from './api.js';

export async function getDashboardSummary() {
  const { data } = await api.get('/analytics/summary');
  return data;
}
