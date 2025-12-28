/**
 * API 配置和 Axios 拦截器
 * 用户管理中心 - HTTP 请求封装
 */

// API配置 - 使用 globalThis.location.origin 确保本地和线上都能正常访问
const BASE_URL = globalThis.location.origin;
const API = `${BASE_URL}/api`;

// Token 管理
const TokenManager = {
    getToken: () => localStorage.getItem('access_token'),
    setToken: (token) => localStorage.setItem('access_token', token),
    getRefreshToken: () => localStorage.getItem('refresh_token'),
    setRefreshToken: (token) => localStorage.setItem('refresh_token', token),
    getUser: () => {
        const user = localStorage.getItem('user_info');
        return user ? JSON.parse(user) : null;
    },
    setUser: (user) => localStorage.setItem('user_info', JSON.stringify(user)),
    clear: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_info');
    },
    isLoggedIn: () => !!localStorage.getItem('access_token'),
};

// 创建 axios 实例
const api = axios.create({
    baseURL: API,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 请求拦截器 - 自动添加 token
api.interceptors.request.use(
    (config) => {
        const token = TokenManager.getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// 响应拦截器 - 处理 401、403 和 token 刷新
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        
        // 处理 401 未授权 - 尝试刷新 token
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = TokenManager.getRefreshToken();
            
            if (refreshToken) {
                const res = await axios.post(`${API}/auth/refresh`, { refreshToken }).catch(() => null);
                if (res?.data?.success && res?.data?.data?.accessToken) {
                    TokenManager.setToken(res.data.data.accessToken);
                    originalRequest.headers.Authorization = `Bearer ${res.data.data.accessToken}`;
                    return api(originalRequest);
                }
            }
            // 刷新失败，清除 token 并刷新页面
            TokenManager.clear();
            globalThis.location.reload();
            return Promise.reject(error);
        }
        
        // 处理其他错误（包括 403），返回响应数据以便业务层处理
        if (error.response) {
            return Promise.resolve(error.response);
        }
        return Promise.reject(error);
    }
);

