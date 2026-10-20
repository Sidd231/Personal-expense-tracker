import { api } from "./api.js";

// Helper to convert array buffer to hex string
function bufToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    const hexParts = [];
    for (let i = 0; i < byteArray.length; i++) {
        const hex = byteArray[i].toString(16);
        const paddedHex = ('00' + hex).slice(-2);
        hexParts.push(paddedHex);
    }
    return hexParts.join('');
}

export const auth = {
    // Client-side SHA-256 password hashing (so cleartext never travels over HTTP)
    async hashPassword(password) {
        if (!password) return "";
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
        return bufToHex(hashBuffer);
    },

    // Register a new account remotely
    async register(username, password) {
        if (!username.trim() || !password) {
            throw new Error("Username and password are required.");
        }
        // Hash once on client
        const clientHash = await this.hashPassword(password);
        return await api.register(username, clientHash);
    },

    // Log in remotely and fetch token
    async login(username, password) {
        if (!username.trim() || !password) {
            throw new Error("Username and password are required.");
        }
        // Hash once on client
        const clientHash = await this.hashPassword(password);
        const sessionData = await api.login(username, clientHash);
        
        // Save user context locally for sidebar rendering
        localStorage.setItem("fin_session_user", sessionData.username);
        return sessionData;
    },

    // Log out session
    logout() {
        api.clearToken();
        localStorage.removeItem("fin_session_user");
    },

    // Retrieve active session details
    getCurrentSession() {
        const token = api.getToken();
        const username = localStorage.getItem("fin_session_user");
        if (token && username) {
            return { username, token };
        }
        return null;
    },

    // Check if user is logged in
    isLoggedIn() {
        return api.getToken() !== null;
    }
};
