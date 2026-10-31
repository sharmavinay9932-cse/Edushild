import api from './api.js';

export async function getInterventions() {
  const { data } = await api.get('/interventions');
  return data;
}

export async function createIntervention(intervention) {
  const { data } = await api.post('/interventions', intervention);
  return data;
}

export async function updateIntervention(id, changes) {
  const { data } = await api.patch(`/interventions/${id}`, changes);
  return data;
}

export async function deleteIntervention(id) {
  await api.delete(`/interventions/${id}`);
}
