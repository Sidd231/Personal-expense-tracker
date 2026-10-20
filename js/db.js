import { api } from "./api.js";

const DB_PREFIX = "fin_";

// Memory cache of user finance data
let cache = {
    accounts: [],
    transactions: [],
    recurring: [],
    loans: [],
    wishlist: [],
    categoryBudgets: [],
    settings: {
        monthlyBudget: 4200,
        profileType: "Balanced"
    }
};

// Retrieve active user from localStorage to segment local storage cache
function getUsername() {
    return localStorage.getItem("fin_session_user") || "guest";
}

// Reset memory cache to default empty structure
function resetMemoryCache() {
    cache = {
        accounts: [],
        transactions: [],
        recurring: [],
        loans: [],
        wishlist: [],
        categoryBudgets: [],
        settings: {
            monthlyBudget: 4200,
            profileType: "Balanced"
        }
    };
}

// Helper to write cache to localStorage as an offline/redundant backup
function saveCacheToLocal() {
    try {
        const username = getUsername();
        localStorage.setItem(`${DB_PREFIX}cache_${username}`, JSON.stringify(cache));
    } catch (e) {
        console.error("Failed to save backup to localStorage:", e);
    }
}

// Helper to read cache from localStorage (fallback)
function loadCacheFromLocal() {
    try {
        const username = getUsername();
        const val = localStorage.getItem(`${DB_PREFIX}cache_${username}`);
        if (val) {
            cache = JSON.parse(val);
        } else {
            resetMemoryCache();
        }
    } catch (e) {
        console.error("Failed to load backup from localStorage:", e);
    }
}

// Background sync worker
async function syncWithServer() {
    saveCacheToLocal();
    if (api.getToken()) {
        try {
            await api.syncData(cache);
        } catch (e) {
            console.warn("Background sync to database server failed:", e);
        }
    }
}

export const db = {
    // Reset cache to default/empty state
    clearCache() {
        resetMemoryCache();
        saveCacheToLocal();
    },

    // Force read data from Node.js database
    async loadFromServer() {
        if (!api.getToken()) {
            loadCacheFromLocal();
            return cache;
        }

        try {
            const data = await api.fetchData();
            if (data && data.freshUser) {
                // New user - start with empty data and sync
                this.clearCache();
                await this.syncRemote();
            } else if (data) {
                cache = data;
                saveCacheToLocal();
            }
        } catch (e) {
            console.error("Failed to sync from database server. Loading local cache:", e);
            loadCacheFromLocal();
        }
        return cache;
    },

    // Force write data to Node.js database (async awaitable)
    async syncRemote() {
        if (api.getToken()) {
            await api.syncData(cache);
        }
    },

    // Accounts
    getAccounts() {
        return cache.accounts || [];
    },
    saveAccounts(accounts) {
        cache.accounts = accounts;
        syncWithServer();
    },

    // Transactions
    getTransactions() {
        return cache.transactions || [];
    },
    saveTransactions(transactions) {
        cache.transactions = transactions;
        syncWithServer();
    },

    // Recurring
    getRecurring() {
        return cache.recurring || [];
    },
    saveRecurring(recurring) {
        cache.recurring = recurring;
        syncWithServer();
    },

    // Loans
    getLoans() {
        return cache.loans || [];
    },
    saveLoans(loans) {
        cache.loans = loans;
        syncWithServer();
    },

    // Wishlist
    getWishlist() {
        return cache.wishlist || [];
    },
    saveWishlist(wishlist) {
        cache.wishlist = wishlist;
        syncWithServer();
    },

    // Category Monthly Budgets (Fixed Monthly Limit & Leftover Rollovers)
    getCategoryBudgets() {
        if (!cache.categoryBudgets || cache.categoryBudgets.length === 0) {
            cache.categoryBudgets = [
                {
                    id: "cb-1",
                    category: "Food",
                    monthlyLimit: 600,
                    rollovers: {},
                    notes: "Groceries, dining out & cafes"
                },
                {
                    id: "cb-2",
                    category: "Shopping",
                    monthlyLimit: 350,
                    rollovers: {},
                    notes: "Retail, tech & personal shopping"
                },
                {
                    id: "cb-3",
                    category: "Entertainment",
                    monthlyLimit: 150,
                    rollovers: {},
                    notes: "Streaming, movies & events"
                },
                {
                    id: "cb-4",
                    category: "Transport",
                    monthlyLimit: 200,
                    rollovers: {},
                    notes: "Gas, transit & rideshares"
                }
            ];
            syncWithServer();
        }
        return cache.categoryBudgets;
    },
    saveCategoryBudgets(budgets) {
        cache.categoryBudgets = budgets;
        syncWithServer();
    },

    // Settings
    getSettings() {
        return cache.settings || { monthlyBudget: 4200, profileType: "Balanced" };
    },
    saveSettings(settings) {
        cache.settings = settings;
        syncWithServer();
    },

    // Backup & Restore
    exportBackup() {
        const blob = new Blob([JSON.stringify(cache, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `finance_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importBackup(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            // Validation
            if (!data.accounts || !data.transactions || !data.recurring || !data.loans || !data.wishlist || !data.settings) {
                throw new Error("Invalid backup file structure: missing key tables.");
            }

            if (!data.categoryBudgets) {
                data.categoryBudgets = [];
            }

            cache = data;
            syncWithServer();
            return true;
        } catch (e) {
            console.error("Backup import failed:", e);
            alert("Failed to import backup: " + e.message);
            return false;
        }
    },

    // Initialize mock data
    initializeMockData(force = false) {
        if (!force && this.getAccounts().length > 0) {
            return;
        }

        cache.accounts = [
            { id: "acc-1", name: "Chase Checking", type: "bank", balance: 8650.00 },
            { id: "acc-2", name: "Wallet Cash", type: "cash", balance: 1620.50 },
            { id: "acc-3", name: "Crypto Ledger", type: "wallet", balance: 2480.00 }
        ];

        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const threeDaysAgo = new Date(today); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fiveDaysAgo = new Date(today); fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const eightDaysAgo = new Date(today); eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

        cache.transactions = [
            {
                id: "tx-1",
                type: "income",
                amount: 3650.00,
                description: "Monthly Salary Acme Corp",
                category: "Salary",
                date: yesterday.toISOString().split("T")[0],
                accountId: "acc-1"
            },
            {
                id: "tx-2",
                type: "expense",
                amount: 89.99,
                description: "Amazon Shopping (Home Goods)",
                category: "Shopping",
                date: yesterday.toISOString().split("T")[0],
                accountId: "acc-1"
            },
            {
                id: "tx-3",
                type: "expense",
                amount: 6.45,
                description: "Starbucks Coffee Latte",
                category: "Food",
                date: yesterday.toISOString().split("T")[0],
                accountId: "acc-2"
            },
            {
                id: "tx-4",
                type: "income",
                amount: 250.00,
                description: "Freelance Logo Design",
                category: "Salary",
                date: threeDaysAgo.toISOString().split("T")[0],
                accountId: "acc-3"
            },
            {
                id: "tx-5",
                type: "expense",
                amount: 15.99,
                description: "Netflix Premium Subscription",
                category: "Entertainment",
                date: fiveDaysAgo.toISOString().split("T")[0],
                accountId: "acc-1"
            },
            {
                id: "tx-6",
                type: "expense",
                amount: 120.00,
                description: "Chevron Gas Refuel",
                category: "Transport",
                date: eightDaysAgo.toISOString().split("T")[0],
                accountId: "acc-2"
            },
            {
                id: "tx-7",
                type: "expense",
                amount: 45.50,
                description: "Whole Foods groceries",
                category: "Food",
                date: eightDaysAgo.toISOString().split("T")[0],
                accountId: "acc-1"
            }
        ];

        cache.recurring = [
            {
                id: "rec-1",
                name: "Netflix Subscription",
                amount: 15.99,
                category: "Entertainment",
                frequency: "Monthly",
                nextDueDate: today.toISOString().split("T")[0],
                accountId: "acc-1"
            },
            {
                id: "rec-2",
                name: "Apartment Rent",
                amount: 1500.00,
                category: "Rent",
                frequency: "Monthly",
                nextDueDate: new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split("T")[0],
                accountId: "acc-1"
            },
            {
                id: "rec-3",
                name: "Spotify Family Plan",
                amount: 16.99,
                category: "Entertainment",
                frequency: "Monthly",
                nextDueDate: new Date(today.getFullYear(), today.getMonth(), 20).toISOString().split("T")[0],
                accountId: "acc-1"
            }
        ];

        const overDueDate = new Date(today);
        overDueDate.setDate(overDueDate.getDate() - 4);

        const nextWeekDate = new Date(today);
        nextWeekDate.setDate(nextWeekDate.getDate() + 7);

        cache.loans = [
            {
                id: "loan-1",
                person: "Sarah Jenkins",
                type: "owe_me",
                amount: 250.00,
                dueDate: nextWeekDate.toISOString().split("T")[0],
                description: "Dinner Split at Italian Bistro",
                settled: false
            },
            {
                id: "loan-2",
                person: "Dave Miller",
                type: "i_owe",
                amount: 120.00,
                dueDate: overDueDate.toISOString().split("T")[0],
                description: "Concert Tickets prepay",
                settled: false
            }
        ];

        cache.wishlist = [
            {
                id: "wish-1",
                name: "PlayStation 5 Console",
                price: 499.99,
                link: "https://amazon.com",
                notes: "For weekend gaming sessions"
            },
            {
                id: "wish-2",
                name: "Ergonomic Office Chair",
                price: 349.00,
                link: "https://steelcase.com",
                notes: "Improve back posture during remote work"
            },
            {
                id: "wish-3",
                name: "DJI Mini Drone",
                price: 799.00,
                link: "https://dji.com",
                notes: "Vlog photography trip"
            }
        ];

        cache.categoryBudgets = [
            {
                id: "cb-1",
                category: "Food",
                monthlyLimit: 600,
                rollovers: {},
                notes: "Groceries, dining out & cafes"
            },
            {
                id: "cb-2",
                category: "Shopping",
                monthlyLimit: 350,
                rollovers: {},
                notes: "Retail, tech & personal shopping"
            },
            {
                id: "cb-3",
                category: "Entertainment",
                monthlyLimit: 150,
                rollovers: {},
                notes: "Streaming, movies & events"
            },
            {
                id: "cb-4",
                category: "Transport",
                monthlyLimit: 200,
                rollovers: {},
                notes: "Gas, transit & rideshares"
            }
        ];

        cache.settings = {
            monthlyBudget: 4200,
            profileType: "Balanced"
        };

        saveCacheToLocal();
    }
};
