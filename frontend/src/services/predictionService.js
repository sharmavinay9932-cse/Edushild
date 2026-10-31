import api from './api.js';

export async function getRiskPredictions() {
  const { data } = await api.get('/risk-analysis');
  return data;
}

export async function getStudentDropoutPrediction(studentId) {
  const { data } = await api.get(
    `/students/${encodeURIComponent(studentId)}/dropout-prediction`,
  );
  return data;
}

export async function getManualDropoutPrediction(inputs) {
  const { data } = await api.post('/predictions/manual', inputs);
  return data;
}
