import axios from "axios";

// Dev: "/api" is proxied to the backend by Vite. Prod: set VITE_API_URL.
const API_BASE_URL: string = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: API_BASE_URL, headers: { "Content-Type": "application/json" } });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken") || sessionStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      const storage = localStorage.getItem("refreshToken") ? localStorage : sessionStorage;
      const refreshToken = storage.getItem("refreshToken");
      if (!refreshToken) return Promise.reject(error);
      original._retry = true;
      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        storage.setItem("accessToken", data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        ["accessToken", "refreshToken", "user"].forEach((k) => storage.removeItem(k));
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
