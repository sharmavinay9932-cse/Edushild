import api from './api.js';

export async function createTeacherStudent(student) {
  const { data } = await api.post('/teacher/students', student);
  return data;
}

export async function getStaffStudentDetails() {
  const { data } = await api.get('/staff/student-details');
  return data;
}
