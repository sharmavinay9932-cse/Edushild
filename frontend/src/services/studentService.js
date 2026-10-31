import api from './api.js';

export async function getStudents() {
  const { data } = await api.get('/students');
  return data;
}

export async function getStudentById(studentId) {
  const { data } = await api.get(`/students/${encodeURIComponent(studentId)}`);
  return data;
}

export async function getMyStudentRecord() {
  const { data } = await api.get('/student/me');
  return data;
}

export async function getMyTeacherEnteredDetails() {
  const { data } = await api.get('/student/me/academic-details');
  return data;
}
