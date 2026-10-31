import api from './api.js';

export async function getUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(account) {
  const { data } = await api.post('/users', account);
  return data;
}

export async function getAssignedStudents(userId) {
  const { data } = await api.get(`/users/${userId}/assigned-students`);
  return data;
}

export async function updateAssignedStudents(userId, studentIds) {
  const { data } = await api.put(`/users/${userId}/assigned-students`, { studentIds });
  return data;
}

export async function updateUserStatus(userId, active) {
  const { data } = await api.patch(`/users/${userId}/status`, { active });
  return data;
}

export async function resetUserPassword(userId, password) {
  await api.patch(`/users/${userId}/password`, { password });
}
