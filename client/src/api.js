import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const ORIGIN = API.replace(/\/api\/?$/, '');
export const assetUrl = (p) => (!p ? '' : p.startsWith('http') ? p : `${ORIGIN}${p}`);

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired, revoked or disabled session ends the login everywhere in the UI.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && localStorage.getItem('token') && !/\/auth\/(login|register)/.test(url)) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('hp-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const errMsg = (e) => e.response?.data?.message || e.message || 'Something went wrong';
export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
// Stay dates are whole days stored in UTC, so format them in UTC to avoid off-by-one shifts.
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtDateTime = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export async function downloadInvoice(booking) {
  const res = await api.get(`/bookings/${booking._id}/invoice`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${booking.invoiceNumber || 'invoice'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default api;
