const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Database Directory setup
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
}

// In-memory sessions store (token -> { username, loginTime })
const sessions = {};
const SERVER_SALT = "aura_wealth_vault_54321_salt";

// Helper to double-hash the client-side hashed password on the server
function serverHashPassword(clientHash) {
    return crypto.createHash('sha256').update(clientHash + SERVER_SALT).digest('hex');
}

// Helper to read users list
function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

// Helper to write users list
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: "Access denied. No session token provided." });
    }

    const session = sessions[token];
    if (!session) {
        return res.status(403).json({ error: "Session expired or invalid. Please sign in again." });
    }

    // Attach user context
    req.user = session;
    next();
}

/* =========================================================================
   REST API ENDPOINTS
   ========================================================================= */

// 1. User Registration
app.post('/api/auth/register', (req, res) => {
    const { username, passwordHash } = req.body;
    
    if (!username || !passwordHash) {
        return res.status(400).json({ error: "Username and password credentials are required." });
    }

    const normalizedUser = username.trim().toLowerCase();
    const users = readUsers();

    if (users[normalizedUser]) {
        return res.status(400).json({ error: "Username already exists." });
    }

    // Save double-hashed credential on the server
    users[normalizedUser] = {
        username: username.trim(),
        passwordHash: serverHashPassword(passwordHash),
        createdAt: new Date().toISOString()
    };

    writeUsers(users);
    res.json({ success: true, message: "User registered successfully." });
});

// 2. User Login
app.post('/api/auth/login', (req, res) => {
    const { username, passwordHash } = req.body;

    if (!username || !passwordHash) {
        return res.status(400).json({ error: "Username and password credentials are required." });
    }

    const normalizedUser = username.trim().toLowerCase();
    const users = readUsers();
    const user = users[normalizedUser];

    if (!user) {
        return res.status(400).json({ error: "Invalid username or password credentials." });
    }

    const targetHash = serverHashPassword(passwordHash);
    if (user.passwordHash !== targetHash && user.passwordHash !== passwordHash) {
        return res.status(400).json({ error: "Invalid username or password credentials." });
    }

    // Auto-migrate legacy single-hashed passwords to salted double-hash
    if (user.passwordHash === passwordHash) {
        user.passwordHash = targetHash;
        writeUsers(users);
    }

    // Generate unique session token using Node crypto API
    const token = "token_" + crypto.randomBytes(16).toString('hex');
    
    // Store session context
    sessions[token] = {
        username: user.username,
        loginTime: Date.now()
    };

    res.json({
        token,
        username: user.username,
        message: "Login successful"
    });
});

// 3. Sync Fetch: GET user data
app.get('/api/data', authenticateToken, (req, res) => {
    const username = req.user.username;
    const userFile = path.join(DATA_DIR, `user_${username.toLowerCase()}.json`);

    if (!fs.existsSync(userFile)) {
        // Return empty structure so the client seeds its own mock data on initial run
        return res.json({ freshUser: true });
    }

    try {
        const fileContent = fs.readFileSync(userFile, 'utf8');
        const data = JSON.parse(fileContent);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Failed to read database records." });
    }
});

// 4. Sync Save: POST user data
app.post('/api/data', authenticateToken, (req, res) => {
    const username = req.user.username;
    const userFile = path.join(DATA_DIR, `user_${username.toLowerCase()}.json`);

    try {
        const payload = req.body;
        // Direct write database isolation
        fs.writeFileSync(userFile, JSON.stringify(payload, null, 2));
        res.json({ success: true, message: "Sync successful." });
    } catch (e) {
        res.status(500).json({ error: "Failed to write database records." });
    }
});

// Serve frontend static assets from the parent directory
app.use(express.static(__dirname));

// Start server listener
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` AuraFinance Database Server Running`);
    console.log(` Port: ${PORT}`);
    console.log(` Server URL: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
