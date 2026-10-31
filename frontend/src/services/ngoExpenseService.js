import api from './api.js';

export async function getNGOExpenses() {
  const { data } = await api.get('/ngo/expenses');
  return data;
}

export async function createNGOExpense(expense) {
  const { data } = await api.post('/ngo/expenses', expense);
  return data;
}

export async function deleteNGOExpense(expenseId) {
  await api.delete(`/ngo/expenses/${expenseId}`);
}
