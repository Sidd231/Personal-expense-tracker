// HTTP Client Service for remote backend synchronization
const API_BASE = "/api";
const TOKEN_KEY = "fin_session_token";

export const api = {
    // Session token retrieval
    getToken() {
        return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    },

    // Session token saving
    saveToken(token) {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(TOKEN_KEY, token);
    },

    // Session token clearing
    clearToken() {
        sessionStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_KEY);
    },

    // Build auth headers
    getHeaders() {
        const token = this.getToken();
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    },

    // Register a new user
    async register(username, passwordHash) {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, passwordHash })
        });
        
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || "Registration failed.");
        }
        return resData;
    },

    // Log in a user
    async login(username, passwordHash) {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, passwordHash })
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || "Login failed.");
        }

        this.saveToken(resData.token);
        return resData;
    },

    // Retrieve user financial data profile
    async fetchData() {
        const response = await fetch(`${API_BASE}/data`, {
            method: "GET",
            headers: this.getHeaders()
        });

        const resData = await response.json();
        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                this.clearToken();
            }
            throw new Error(resData.error || "Failed to fetch data.");
        }
        return resData;
    },

    // Sync current state to the database
    async syncData(data) {
        const response = await fetch(`${API_BASE}/data`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(data)
        });

        const resData = await response.json();
        if (!response.ok) {
            if (response.status === 403 || response.status === 401) {
                this.clearToken();
            }
            throw new Error(resData.error || "Failed to sync data.");
        }
        return resData;
    }
};
