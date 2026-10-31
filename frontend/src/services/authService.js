import api, { setAccessToken } from './api.js';

const allowedRoles = new Set(['admin', 'teacher', 'student', 'ngo']);

export async function signIn({ email, password, role }) {
  if (!allowedRoles.has(role)) {
    throw new Error('Choose an admin, teacher, student, or NGO account type.');
  }

  const { data } = await api.post('/auth/login', { email, password, role });
  if (
    !data
    || typeof data.accessToken !== 'string'
    || !data.accessToken
    || !data.user
    || typeof data.user.id !== 'string'
    || typeof data.user.displayName !== 'string'
    || !allowedRoles.has(data.user.role)
  ) {
    throw new Error('The login service returned an invalid response.');
  }

  if (data.user.role !== role) {
    throw new Error('The account type returned by the login service does not match the selected role.');
  }

  setAccessToken(data.accessToken);
  return data.user;
}

export async function requestPasswordReset(email) {
  const { data } = await api.post('/auth/password-reset', { email });
  if (!data || typeof data.message !== 'string') {
    throw new Error('The password reset service returned an invalid response.');
  }
  return data.message;
}

export async function confirmPasswordReset({ token, password }) {
  await api.post('/auth/password-reset/confirm', { token, password });
}

export function signOut() {
  setAccessToken(null);
}
