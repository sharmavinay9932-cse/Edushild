import api from './api.js';

export const supportCategories = [
  { value: 'tuition', label: 'Tuition and fees' },
  { value: 'books', label: 'Books and learning materials' },
  { value: 'transport', label: 'Transport' },
  { value: 'school_supplies', label: 'School supplies' },
  { value: 'exam_fees', label: 'Examination fees' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'meals', label: 'Meals' },
  { value: 'other', label: 'Other education expense' },
];

export const supportRequestStatuses = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'referred', label: 'Referred to NGO' },
  { value: 'approved', label: 'Sent to NGOs — awaiting response' },
  { value: 'accepted', label: 'Accepted by NGO' },
  { value: 'declined', label: 'Declined' },
  { value: 'completed', label: 'Completed' },
];

export const adminSupportRequestStatuses = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approve and send to NGOs' },
  { value: 'declined', label: 'Decline' },
];

export async function getMySupportRequests() {
  const { data } = await api.get('/student/support-requests');
  return data;
}

export async function submitSupportRequest(request) {
  const { data } = await api.post('/student/support-requests', request);
  return data;
}

export async function getAdminSupportRequests() {
  const { data } = await api.get('/admin/support-requests');
  return data;
}

export async function updateSupportRequestStatus(requestId, status) {
  const { data } = await api.patch(`/admin/support-requests/${requestId}`, { status });
  return data;
}

export async function getNGOSupportOffers() {
  const { data } = await api.get('/ngo/support-requests');
  return data;
}

export async function acceptNGOSupportRequest(requestId) {
  const { data } = await api.post(`/ngo/support-requests/${requestId}/accept`);
  return data;
}
