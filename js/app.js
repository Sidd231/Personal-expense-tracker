import { db } from "./db.js";
import { auth } from "./auth.js";
import { ui } from "./ui.js";
import { scanner } from "./scanner.js";

// Global references to ChartJS instances
let incomeExpenseChart = null;
let categoryChart = null;

// App-wide State
const state = {
    accounts: [],
    transactions: [],
    recurring: [],
    loans: [],
    wishlist: [],
    categoryBudgets: [],
    settings: {},
    currentFilter: "all", // all, weekly, monthly
    budgetViewMonth: new Date().toISOString().substring(0, 7)
};

// Initial setup and boot
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Setup event listeners
    setupEventListeners();

    // 2. Setup auth check
    checkAuthSession();

    // 3. Load user specific remote database state if logged in
    if (auth.isLoggedIn()) {
        await db.loadFromServer();
        loadStateFromDb();
    }

    // 4. Client-side page router initialisation
    handleRouting();
    window.addEventListener("hashchange", handleRouting);
});

// Load variables from db.js localstorage service
function loadStateFromDb() {
    state.accounts = db.getAccounts();
    state.transactions = db.getTransactions();
    state.recurring = db.getRecurring();
    state.loans = db.getLoans();
    state.wishlist = db.getWishlist();
    state.categoryBudgets = db.getCategoryBudgets();
    state.settings = db.getSettings();
}

// Check session tokens and load profile names
function checkAuthSession() {
    const session = auth.getCurrentSession();
    const authOverlay = document.getElementById("authOverlay");
    
    if (!session) {
        // Show auth portal, hide app
        authOverlay.style.display = "flex";
    } else {
        // Hide auth, show app and load profiles
        authOverlay.style.display = "none";
        
        // Setup username and user role card in sidebar
        document.getElementById("sidebarUsername").innerText = session.username;
        document.getElementById("sidebarAvatar").innerText = session.username.charAt(0).toUpperCase();
        
        // Fill profile role based on Settings
        const settings = db.getSettings();
        document.getElementById("sidebarRole").innerText = settings.profileType + " Profile";
    }
}

// Router for SPA navigation tabs
function handleRouting() {
    if (!auth.isLoggedIn()) {
        checkAuthSession();
        return;
    }

    const hash = window.location.hash || "#dashboard";
    const targetPageId = hash.replace("#", "") + "Page";
    
    // Switch active nav item in sidebar
    document.querySelectorAll(".nav-item").forEach(item => {
        const link = item.querySelector("a");
        if (link && link.getAttribute("href") === hash) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Toggle pages visibility
    document.querySelectorAll(".page-view").forEach(page => {
        if (page.id === targetPageId) {
            page.classList.add("active");
        } else {
            page.classList.remove("active");
        }
    });

    // Render corresponding page logic
    renderPage(hash.replace("#", ""));
}

// Redraw page templates
function renderPage(pageName) {
    loadStateFromDb();
    
    switch (pageName) {
        case "dashboard":
            renderDashboard();
            break;
        case "transactions":
            renderTransactions();
            break;
        case "accounts":
            renderAccounts();
            break;
        case "recurring":
            renderRecurring();
            break;
        case "loans":
            renderLoans();
            break;
        case "wishlist":
            renderWishlist();
            break;
        case "budgets":
            renderBudgets();
            break;
        case "settings":
            renderSettings();
            break;
        default:
            renderDashboard();
    }
    
    ui.refreshIcons();
}

/* =========================================================================
   PAGE RENDERING & CALCULATION MODULES
   ========================================================================= */

// --- 🏠 DASHBOARD PAGE ---
function renderDashboard() {
    // 1. Calculate Net Worth and Balance Snapshots
    let totalNetWorth = 0;
    state.accounts.forEach(a => totalNetWorth += a.balance);
    document.getElementById("dashNetWorth").innerText = ui.formatCurrency(totalNetWorth);

    // Calculate this month's Income & Expenses
    const currentMonthStr = new Date().toISOString().substring(0, 7); // YYYY-MM
    let monthlyIncome = 0;
    let monthlyExpense = 0;

    state.transactions.forEach(t => {
        if (t.date.startsWith(currentMonthStr)) {
            if (t.type === "income") {
                monthlyIncome += t.amount;
            } else {
                monthlyExpense += t.amount;
            }
        }
    });

    document.getElementById("dashMonthlyIncome").innerText = ui.formatCurrency(monthlyIncome);
    document.getElementById("dashMonthlyExpense").innerText = ui.formatCurrency(monthlyExpense);

    // Calculate monthly savings
    const monthlySavings = Math.max(0, monthlyIncome - monthlyExpense);
    document.getElementById("dashMonthlySavings").innerText = ui.formatCurrency(monthlySavings);

    // 2. Render Real-time Alert Banners
    renderDashboardAlerts(monthlyExpense, totalNetWorth);

    // 3. Render recent transactions table (limit 5)
    const recentTxList = [...state.transactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    const tbody = document.getElementById("dashRecentTransactionsBody");
    tbody.innerHTML = "";

    if (recentTxList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No recent transactions logged.</td></tr>`;
    } else {
        recentTxList.forEach(t => {
            const tr = document.createElement("tr");
            const amtClass = t.type === "income" ? "badge-income" : "badge-expense";
            const amtPrefix = t.type === "income" ? "+" : "-";
            const iconHtml = ui.getIconHtml(t.category, t.type);
            const accountName = state.accounts.find(a => a.id === t.accountId)?.name || "Default";

            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${iconHtml}
                        <div>
                            <div style="font-weight: 700;">${t.description}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${accountName}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${ui.categoryClasses[t.category] || 'badge-warning'}">${t.category}</span></td>
                <td>${ui.formatDate(t.date)}</td>
                <td><span class="badge ${amtClass}">${amtPrefix}${ui.formatCurrency(t.amount)}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 4. Render Dashboard Charts
    renderDashboardCharts(currentMonthStr);

    // 5. Render Monthly Category Budgets Envelopes
    renderDashboardBudgets();
}

// Calculates and loads warning alerts
function renderDashboardAlerts(monthlyExpense, netWorth) {
    const container = document.getElementById("dashAlertsContainer");
    container.innerHTML = "";
    let hasAlerts = false;

    // A. Monthly Budget Limit check
    const budgetLimit = state.settings.monthlyBudget;
    if (monthlyExpense > budgetLimit) {
        hasAlerts = true;
        const div = document.createElement("div");
        div.className = "alert-banner danger";
        div.innerHTML = `
            <i data-lucide="alert-octagon"></i>
            <div><strong>Budget Overrun!</strong> You have spent ${ui.formatCurrency(monthlyExpense)} this month, exceeding your monthly budget limit of ${ui.formatCurrency(budgetLimit)} by ${ui.formatCurrency(monthlyExpense - budgetLimit)}.</div>
        `;
        container.appendChild(div);
    } else if (monthlyExpense > budgetLimit * 0.85) {
        hasAlerts = true;
        const div = document.createElement("div");
        div.className = "alert-banner warning";
        div.innerHTML = `
            <i data-lucide="alert-triangle"></i>
            <div><strong>Budget warning:</strong> You have consumed ${Math.round((monthlyExpense / budgetLimit) * 100)}% of your monthly budget.</div>
        `;
        container.appendChild(div);
    }

    // Category Budgets Overrun & Warning Check
    (state.categoryBudgets || []).forEach(b => {
        const bData = calculateCategoryBudget(b, new Date().toISOString().substring(0, 7));
        if (bData.spent > bData.totalAllowed) {
            hasAlerts = true;
            const div = document.createElement("div");
            div.className = "alert-banner danger";
            div.innerHTML = `
                <i data-lucide="alert-octagon"></i>
                <div><strong>Category Limit Exceeded:</strong> You have spent ${ui.formatCurrency(bData.spent)} on <strong>${b.category}</strong> this month, exceeding your allowed monthly allowance of ${ui.formatCurrency(bData.totalAllowed)} by ${ui.formatCurrency(bData.spent - bData.totalAllowed)}.</div>
            `;
            container.appendChild(div);
        } else if (bData.totalAllowed > 0 && bData.spent >= bData.totalAllowed * 0.85) {
            hasAlerts = true;
            const div = document.createElement("div");
            div.className = "alert-banner warning";
            div.innerHTML = `
                <i data-lucide="alert-triangle"></i>
                <div><strong>Category Warning:</strong> You have used ${bData.pct}% of your <strong>${b.category}</strong> monthly budget (${ui.formatCurrency(bData.remaining)} remaining).</div>
            `;
            container.appendChild(div);
        }
    });

    // B. Overdue Loans check
    const todayStr = new Date().toISOString().split("T")[0];
    const overdueLoans = state.loans.filter(l => !l.settled && l.dueDate < todayStr);
    if (overdueLoans.length > 0) {
        hasAlerts = true;
        const div = document.createElement("div");
        div.className = "alert-banner danger";
        div.innerHTML = `
            <i data-lucide="clock"></i>
            <div><strong>Overdue Debt Alert:</strong> You have ${overdueLoans.length} loan payment deadline(s) past due! Please settle immediately.</div>
        `;
        container.appendChild(div);
    }

    // C. Recurring payment due today check
    const dueRecurring = state.recurring.filter(r => r.nextDueDate === todayStr);
    if (dueRecurring.length > 0) {
        hasAlerts = true;
        const div = document.createElement("div");
        div.className = "alert-banner warning";
        div.innerHTML = `
            <i data-lucide="calendar"></i>
            <div><strong>Due Today:</strong> ${dueRecurring.length} recurring subscription bill(s) are due today. Click on Recurring to pay them.</div>
        `;
        container.appendChild(div);
    }

    // D. Wishlist Buy Recommendation check
    let highlyRecCount = 0;
    state.wishlist.forEach(item => {
        const recommendation = evaluateWishlistItem(item, netWorth, budgetLimit - monthlyExpense);
        if (recommendation.rating === "highly-rec") {
            highlyRecCount++;
        }
    });
    if (highlyRecCount > 0) {
        hasAlerts = true;
        const div = document.createElement("div");
        div.className = "alert-banner success";
        div.innerHTML = `
            <i data-lucide="sparkles"></i>
            <div><strong>Smart Buy Advisories:</strong> Your profile settings indicate ${highlyRecCount} wishlist item(s) are highly viable for purchase right now!</div>
        `;
        container.appendChild(div);
    }

    if (hasAlerts) {
        ui.refreshIcons();
    }
}

// Renders the ChartJS canvas graphics
function renderDashboardCharts(currentMonthStr) {
    const canvasBar = document.getElementById("incomeExpenseChart");
    const canvasPie = document.getElementById("categoryChart");

    if (!canvasBar || !canvasPie) return;

    // Destroy existing charts to prevent overlaps
    if (incomeExpenseChart) {
        incomeExpenseChart.destroy();
    }
    if (categoryChart) {
        categoryChart.destroy();
    }

    // A. Chart 1: Bar Chart (Income vs Expense - Monthly history)
    // Gather last 4 months comparison data
    const last4Months = [];
    const today = new Date();
    for (let i = 3; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        last4Months.push(d.toISOString().substring(0, 7)); // YYYY-MM
    }

    const monthLabels = last4Months.map(m => {
        const parts = m.split('-');
        const date = new Date(parts[0], parts[1] - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    });

    const incomeData = [0, 0, 0, 0];
    const expenseData = [0, 0, 0, 0];

    state.transactions.forEach(t => {
        const tMonth = t.date.substring(0, 7);
        const mIndex = last4Months.indexOf(tMonth);
        if (mIndex !== -1) {
            if (t.type === "income") {
                incomeData[mIndex] += t.amount;
            } else {
                expenseData[mIndex] += t.amount;
            }
        }
    });

    incomeExpenseChart = new Chart(canvasBar, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: '#10b981', // green
                    borderRadius: 6
                },
                {
                    label: 'Expense',
                    data: expenseData,
                    backgroundColor: '#f59e0b', // premium yellow/gold
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Plus Jakarta Sans', weight: '700' } } }
            },
            scales: {
                x: { grid: { display: false } },
                y: { ticks: { callback: value => '$' + value } }
            }
        }
    });

    // B. Chart 2: Donut Chart (Category breakdown for current month)
    const categoryTotals = {};
    state.transactions.forEach(t => {
        if (t.date.startsWith(currentMonthStr) && t.type === "expense") {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
        }
    });

    const pieLabels = Object.keys(categoryTotals);
    const pieData = Object.values(categoryTotals);

    // Fallback if no expenses this month
    if (pieLabels.length === 0) {
        pieLabels.push("No Expenses");
        pieData.push(1);
    }

    const premiumPaletteColors = [
        '#f59e0b', // yellow gold
        '#d97706', // deep amber
        '#475569', // slate
        '#10b981', // emerald
        '#f43f5e', // rose
        '#3b82f6', // blue
        '#8b5cf6', // purple
        '#14b8a6'  // teal
    ];

    categoryChart = new Chart(canvasPie, {
        type: 'doughnut',
        data: {
            labels: pieLabels,
            datasets: [{
                data: pieData,
                backgroundColor: premiumPaletteColors.slice(0, pieLabels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Plus Jakarta Sans', weight: '700' } } }
            }
        }
    });
}


// --- 💸 TRANSACTIONS PAGE ---
function renderTransactions() {
    const tbody = document.getElementById("txTableBody");
    tbody.innerHTML = "";

    // Filters logic
    const filter = state.currentFilter;
    const today = new Date();
    let filteredList = [...state.transactions];

    if (filter === "weekly") {
        // Filter transactions within past 7 days
        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        filteredList = filteredList.filter(t => new Date(t.date) >= oneWeekAgo);
    } else if (filter === "monthly") {
        // Filter transactions within past 30 days
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        filteredList = filteredList.filter(t => new Date(t.date) >= oneMonthAgo);
    }

    // Sort descending by date
    filteredList.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No matching transactions found. Click Add Transaction or use the AI Scanner.</td></tr>`;
        return;
    }

    filteredList.forEach(t => {
        const tr = document.createElement("tr");
        const amtClass = t.type === "income" ? "badge-income" : "badge-expense";
        const amtPrefix = t.type === "income" ? "+" : "-";
        const iconHtml = ui.getIconHtml(t.category, t.type);
        const accountName = state.accounts.find(a => a.id === t.accountId)?.name || "Default";

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${iconHtml}
                    <strong>${t.description}</strong>
                </div>
            </td>
            <td><span class="badge ${ui.categoryClasses[t.category] || 'badge-warning'}">${t.category}</span></td>
            <td>${ui.formatDate(t.date)}</td>
            <td>${accountName}</td>
            <td><span class="badge ${amtClass}">${amtPrefix}${ui.formatCurrency(t.amount)}</span></td>
            <td>
                <button class="delete-btn tx-delete-trigger" data-id="${t.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attach delete listeners
    document.querySelectorAll(".tx-delete-trigger").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = btn.getAttribute("data-id");
            if (confirm("Delete this transaction? The account balance will not revert automatically.")) {
                deleteTransaction(id);
            }
        });
    });
}

function deleteTransaction(id) {
    const updated = state.transactions.filter(t => t.id !== id);
    db.saveTransactions(updated);
    renderTransactions();
}


// --- 🏦 ACCOUNTS PAGE ---
function renderAccounts() {
    const grid = document.getElementById("accountsCardsGrid");
    grid.innerHTML = "";

    // 1. Render net worth banner
    let netWorth = 0;
    state.accounts.forEach(a => netWorth += a.balance);
    document.getElementById("accNetWorthDisplay").innerText = ui.formatCurrency(netWorth);

    // Fill options for Add Transaction account select
    const accountSelect = document.getElementById("txAccount");
    accountSelect.innerHTML = "";
    state.accounts.forEach(a => {
        accountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });

    // 2. Render cards
    state.accounts.forEach(acc => {
        const card = document.createElement("div");
        card.className = `account-gradient-card ${acc.type}`;
        
        card.innerHTML = `
            <div class="account-card-header">
                <span class="account-card-type">${acc.type}</span>
                <i data-lucide="${acc.type === 'bank' ? 'landmark' : acc.type === 'cash' ? 'banknote' : 'wallet'}"></i>
            </div>
            <div>
                <h3 style="font-weight: 700; font-size: 16px;">${acc.name}</h3>
                <div class="account-card-balance">${ui.formatCurrency(acc.balance)}</div>
            </div>
            <div class="account-card-actions">
                <button class="account-mini-btn acc-deposit" data-id="${acc.id}">Deposit</button>
                <button class="account-mini-btn acc-withdraw" data-id="${acc.id}">Withdraw</button>
            </div>
        `;
        grid.appendChild(card);
    });

    // 3. Attach actions listeners
    document.querySelectorAll(".acc-deposit").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openDepositWithdrawModal(id, "deposit");
        });
    });

    document.querySelectorAll(".acc-withdraw").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            openDepositWithdrawModal(id, "withdraw");
        });
    });
}

function openDepositWithdrawModal(accountId, actionType) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return;

    document.getElementById("dwAccountId").value = accountId;
    document.getElementById("dwActionType").value = actionType;
    document.getElementById("dwModalTitle").innerText = actionType === "deposit" 
        ? `Deposit Money into ${account.name}` 
        : `Withdraw Money from ${account.name}`;
    
    ui.openModal("#depositWithdrawModal");
}


// --- 🔄 RECURRING BILLS PAGE ---
function renderRecurring() {
    const grid = document.getElementById("recurringGrid");
    grid.innerHTML = "";

    const todayStr = new Date().toISOString().split("T")[0];

    // Select account inputs for recurring modal
    const recAccountSelect = document.getElementById("recAccount");
    recAccountSelect.innerHTML = "";
    state.accounts.forEach(a => {
        recAccountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });

    if (state.recurring.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No recurring items added yet. Click Add Subscription.</div>`;
        return;
    }

    state.recurring.forEach(rec => {
        const card = document.createElement("div");
        card.className = "list-item-card";

        const isDueToday = rec.nextDueDate === todayStr;
        const isOverdue = rec.nextDueDate < todayStr;
        
        let statusBadge = `<span class="badge badge-income">Upcoming</span>`;
        if (isDueToday) {
            statusBadge = `<span class="badge badge-warning">Due Today</span>`;
        } else if (isOverdue) {
            statusBadge = `<span class="badge badge-danger">Overdue</span>`;
        }

        const accountName = state.accounts.find(a => a.id === rec.accountId)?.name || "Default";

        card.innerHTML = `
            <div class="list-item-header">
                <div>
                    <h3 class="list-item-title">${rec.name}</h3>
                    <div style="font-size: 12px; color: var(--text-muted);">${rec.category} • ${rec.frequency}</div>
                </div>
                ${statusBadge}
            </div>
            <div class="list-item-details">
                <div style="display:flex; justify-content:space-between;">
                    <span>Account:</span>
                    <strong>${accountName}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Next Due Date:</span>
                    <strong>${ui.formatDate(rec.nextDueDate)}</strong>
                </div>
            </div>
            <div class="list-item-meta">
                <span class="list-item-val">${ui.formatCurrency(rec.amount)}</span>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary pay-rec-btn" data-id="${rec.id}">Mark Paid</button>
                    <button class="delete-btn delete-rec-btn" data-id="${rec.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Pay subscription events
    document.querySelectorAll(".pay-rec-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            payRecurringBill(id);
        });
    });

    // Delete subscription events
    document.querySelectorAll(".delete-rec-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Remove this subscription/recurring reminder?")) {
                const updated = state.recurring.filter(r => r.id !== id);
                db.saveRecurring(updated);
                renderRecurring();
            }
        });
    });
}

function payRecurringBill(id) {
    const rec = state.recurring.find(r => r.id === id);
    if (!rec) return;

    // 1. Verify and deduct funds from selected account
    const acc = state.accounts.find(a => a.id === rec.accountId);
    if (acc) {
        acc.balance -= rec.amount;
        db.saveAccounts(state.accounts);
    }

    // 2. Log expense transaction
    const newTx = {
        id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
        type: "expense",
        amount: rec.amount,
        description: `Autopay: ${rec.name}`,
        category: rec.category,
        date: new Date().toISOString().split("T")[0],
        accountId: rec.accountId
    };
    state.transactions.push(newTx);
    db.saveTransactions(state.transactions);

    // 3. Advance Next Due date (add monthly/weekly)
    const currentDueDate = new Date(rec.nextDueDate);
    if (rec.frequency === "Monthly") {
        currentDueDate.setMonth(currentDueDate.getMonth() + 1);
    } else if (rec.frequency === "Weekly") {
        currentDueDate.setDate(currentDueDate.getDate() + 7);
    } else if (rec.frequency === "Yearly") {
        currentDueDate.setFullYear(currentDueDate.getFullYear() + 1);
    }
    rec.nextDueDate = currentDueDate.toISOString().split("T")[0];
    db.saveRecurring(state.recurring);

    alert(`Successfully processed ${ui.formatCurrency(rec.amount)} payment for ${rec.name}. Date advanced to ${ui.formatDate(rec.nextDueDate)}.`);
    renderRecurring();
}


// --- 💳 LOANS & IOUS PAGE ---
function renderLoans() {
    const grid = document.getElementById("loansGrid");
    grid.innerHTML = "";

    const todayStr = new Date().toISOString().split("T")[0];

    if (state.loans.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No loans/debt entries recorded. Click Add IOU.</div>`;
        return;
    }

    state.loans.forEach(loan => {
        const card = document.createElement("div");
        card.className = "list-item-card";

        const isOverdue = !loan.settled && loan.dueDate < todayStr;
        let badgeHtml = "";
        
        if (loan.settled) {
            badgeHtml = `<span class="badge badge-income">Settled</span>`;
        } else if (isOverdue) {
            badgeHtml = `<span class="badge badge-danger">OVERDUE</span>`;
        } else {
            badgeHtml = `<span class="badge badge-warning">Active</span>`;
        }

        const detailsText = loan.type === "owe_me" 
            ? `${loan.person} owes you` 
            : `You owe ${loan.person}`;

        card.innerHTML = `
            <div class="list-item-header">
                <div>
                    <h3 class="list-item-title">${loan.person}</h3>
                    <div style="font-size: 12px; color: var(--text-muted);">${detailsText}</div>
                </div>
                ${badgeHtml}
            </div>
            <div class="list-item-details">
                <p><strong>Note:</strong> ${loan.description || "N/A"}</p>
                <div style="display:flex; justify-content:space-between; margin-top: 6px;">
                    <span>Deadline:</span>
                    <strong style="${isOverdue ? 'color: var(--danger);' : ''}">${ui.formatDate(loan.dueDate)}</strong>
                </div>
            </div>
            <div class="list-item-meta">
                <span class="list-item-val">${ui.formatCurrency(loan.amount)}</span>
                <div style="display: flex; gap: 8px;">
                    ${!loan.settled ? `<button class="btn btn-secondary settle-loan-btn" data-id="${loan.id}">Settle</button>` : ""}
                    <button class="delete-btn delete-loan-btn" data-id="${loan.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Settle button events
    document.querySelectorAll(".settle-loan-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            settleLoan(id);
        });
    });

    // Delete button events
    document.querySelectorAll(".delete-loan-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Delete this IOU/Loan record?")) {
                const updated = state.loans.filter(l => l.id !== id);
                db.saveLoans(updated);
                renderLoans();
            }
        });
    });
}

function settleLoan(id) {
    const loan = state.loans.find(l => l.id === id);
    if (!loan) return;

    // Ask which account should balance be applied to
    let accountOptions = "";
    state.accounts.forEach((a, index) => {
        accountOptions += `${index + 1}: ${a.name} (Balance: ${ui.formatCurrency(a.balance)})\n`;
    });

    const selectionIndex = prompt(`Choose an account index to record settlement:\n\n${accountOptions}`);
    const selectedNum = parseInt(selectionIndex) - 1;
    
    if (isNaN(selectedNum) || selectedNum < 0 || selectedNum >= state.accounts.length) {
        alert("Invalid account selection. Settlement cancelled.");
        return;
    }

    const selectedAcc = state.accounts[selectedNum];
    
    // Apply balance adjustment
    if (loan.type === "owe_me") {
        // Sarah pays me back -> cash deposits in my account
        selectedAcc.balance += loan.amount;
    } else {
        // I pay Dave back -> cash deducted from my account
        selectedAcc.balance -= loan.amount;
    }
    db.saveAccounts(state.accounts);

    // Create log transaction
    const newTx = {
        id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
        type: loan.type === "owe_me" ? "income" : "expense",
        amount: loan.amount,
        description: `Settled Debt: ${loan.person} (${loan.description})`,
        category: "Transfer",
        date: new Date().toISOString().split("T")[0],
        accountId: selectedAcc.id
    };
    state.transactions.push(newTx);
    db.saveTransactions(state.transactions);

    // Mark settled
    loan.settled = true;
    db.saveLoans(state.loans);

    alert(`Successfully settled debt with ${loan.person}. ${ui.formatCurrency(loan.amount)} recorded in ${selectedAcc.name}.`);
    renderLoans();
}


// --- 🛍️ WISHLIST PAGE & RECOMMENDATION ENGINE ---
function renderWishlist() {
    const grid = document.getElementById("wishlistGrid");
    grid.innerHTML = "";

    // 1. Calculate net worth and current month remaining budget
    let netWorth = 0;
    state.accounts.forEach(a => netWorth += a.balance);

    const currentMonthStr = new Date().toISOString().substring(0, 7);
    let monthlyExpense = 0;
    state.transactions.forEach(t => {
        if (t.date.startsWith(currentMonthStr) && t.type === "expense") {
            monthlyExpense += t.amount;
        }
    });

    const budgetRemaining = state.settings.monthlyBudget - monthlyExpense;

    if (state.wishlist.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">No wish goals registered. Click Add Wishlist Item.</div>`;
        return;
    }

    state.wishlist.forEach(item => {
        const card = document.createElement("div");
        card.className = "list-item-card";

        // Call recommendation logic
        const evalResult = evaluateWishlistItem(item, netWorth, budgetRemaining);

        let tagClass = "rating-tag feasible";
        let ratingText = "Feasible";
        if (evalResult.rating === "highly-rec") {
            tagClass = "rating-tag highly-rec";
            ratingText = "Highly Recommended";
        } else if (evalResult.rating === "not-rec") {
            tagClass = "rating-tag not-rec";
            ratingText = "Not Recommended";
        }

        card.innerHTML = `
            <div class="list-item-header">
                <div>
                    <h3 class="list-item-title">${item.name}</h3>
                    <a href="${item.link}" target="_blank" style="font-size: 11px; color: var(--primary-dark); font-weight:700;">Buy Link <i data-lucide="external-link" style="display:inline-block; width:10px; height:10px; vertical-align:middle;"></i></a>
                </div>
                <span class="${tagClass}">${ratingText}</span>
            </div>
            <div class="list-item-details">
                <p><strong>Notes:</strong> ${item.notes || "No notes."}</p>
                <div style="margin-top: 10px; font-size: 12px; padding: 10px; background-color: var(--primary-soft); border-radius: var(--radius-sm); border: 1px solid rgba(245, 158, 11, 0.05);">
                    <strong style="color:var(--text-primary); display:block; margin-bottom: 2px;">AI Buy Advisory:</strong>
                    ${evalResult.reason}
                </div>
            </div>
            <div class="list-item-meta">
                <span class="list-item-val">${ui.formatCurrency(item.price)}</span>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-primary buy-now-btn" data-id="${item.id}">Buy Now</button>
                    <button class="delete-btn delete-wish-btn" data-id="${item.id}"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // Buy now handler
    document.querySelectorAll(".buy-now-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            buyWishlistItem(id);
        });
    });

    // Delete wish handler
    document.querySelectorAll(".delete-wish-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            if (confirm("Remove this goal from your wishlist?")) {
                const updated = state.wishlist.filter(w => w.id !== id);
                db.saveWishlist(updated);
                renderWishlist();
            }
        });
    });
}

// core recommendation engine algorithm
function evaluateWishlistItem(item, netWorth, budgetRemaining) {
    const price = item.price;
    const profile = state.settings.profileType; // Frugal, Balanced, Splurger

    let maxNetWorthPct = 0.15; // Balanced default: item must be <15% of Net Worth
    let minBudgetSafetyPct = 1.0; // Balanced default: must have 100% of price in budget remaining

    if (profile === "Frugal") {
        maxNetWorthPct = 0.05; // Frugal: must be <5% of Net Worth
        minBudgetSafetyPct = 1.5; // Frugal: must have 150% of price in remaining budget
    } else if (profile === "Splurger") {
        maxNetWorthPct = 0.35; // Splurger: can be up to 35% of Net Worth
        minBudgetSafetyPct = 0.5; // Splurger: only needs 50% of price in budget remaining
    }

    const netWorthCap = netWorth * maxNetWorthPct;
    const netWorthViable = price <= netWorthCap;
    const budgetViable = budgetRemaining >= (price * minBudgetSafetyPct);

    if (netWorthViable && budgetViable) {
        return {
            rating: "highly-rec",
            reason: `Safe choice! Under your "${profile}" profile, this costs less than ${Math.round(maxNetWorthPct * 100)}% of your Net Worth and your remaining budget is safe.`
        };
    } else if (!netWorthViable && !budgetViable) {
        return {
            rating: "not-rec",
            reason: `Risk alert! Under your "${profile}" profile, this costs too much compared to your Net Worth (threshold: ${ui.formatCurrency(netWorthCap)}), and you don't have enough monthly budget remaining.`
        };
    } else if (!netWorthViable) {
        return {
            rating: "not-rec",
            reason: `Not recommended: Item cost exceeds your "${profile}" profile asset cap limit of ${Math.round(maxNetWorthPct * 100)}% of your Net Worth (${ui.formatCurrency(netWorthCap)}).`
        };
    } else {
        return {
            rating: "feasible",
            reason: `Feasible choice: Asset ratio is fine, but purchasing this now will squeeze your monthly budget. Wait until next month or increase your savings.`
        };
    }
}

function buyWishlistItem(id) {
    const item = state.wishlist.find(w => w.id === id);
    if (!item) return;

    // Ask which account should be used
    let accountOptions = "";
    state.accounts.forEach((a, idx) => {
        accountOptions += `${idx + 1}: ${a.name} (Balance: ${ui.formatCurrency(a.balance)})\n`;
    });

    const selectionIndex = prompt(`Buy Goal "${item.name}" for ${ui.formatCurrency(item.price)}\nChoose account index to fund purchase:\n\n${accountOptions}`);
    const selectedNum = parseInt(selectionIndex) - 1;

    if (isNaN(selectedNum) || selectedNum < 0 || selectedNum >= state.accounts.length) {
        alert("Invalid account selection. Purchase cancelled.");
        return;
    }

    const selectedAcc = state.accounts[selectedNum];
    
    // Check balance
    if (selectedAcc.balance < item.price) {
        alert(`Insufficient funds in ${selectedAcc.name}! (Balance: ${ui.formatCurrency(selectedAcc.balance)})`);
        return;
    }

    // 1. Deduct funds
    selectedAcc.balance -= item.price;
    db.saveAccounts(state.accounts);

    // 2. Log transaction
    const newTx = {
        id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
        type: "expense",
        amount: item.price,
        description: `Bought Wish: ${item.name}`,
        category: "Shopping",
        date: new Date().toISOString().split("T")[0],
        accountId: selectedAcc.id
    };
    state.transactions.push(newTx);
    db.saveTransactions(state.transactions);

    // 3. Remove item from wishlist
    state.wishlist = state.wishlist.filter(w => w.id !== id);
    db.saveWishlist(state.wishlist);

    alert(`Congratulations! Purchased "${item.name}" for ${ui.formatCurrency(item.price)} from ${selectedAcc.name}. Logged under Transactions.`);
    renderWishlist();
}


// --- ⚙️ SETTINGS PAGE ---
function renderSettings() {
    document.getElementById("setBudget").value = state.settings.monthlyBudget;
    document.getElementById("setProfile").value = state.settings.profileType;
}

/* =========================================================================
   💰 MONTHLY CATEGORY BUDGETS & LEFTOVER ROLLOVERS MODULE
   ========================================================================= */

let pendingExpenseAction = null;

// Month calculation utilities
function getPrevMonth(monthStr) {
    const parts = monthStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = new Date(y, m - 2, 1);
    const prevY = d.getFullYear();
    const prevM = String(d.getMonth() + 1).padStart(2, '0');
    return `${prevY}-${prevM}`;
}

function getNextMonth(monthStr) {
    const parts = monthStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = new Date(y, m, 1);
    const nextY = d.getFullYear();
    const nextM = String(d.getMonth() + 1).padStart(2, '0');
    return `${nextY}-${nextM}`;
}

function formatMonthLabel(monthStr) {
    if (!monthStr) return "";
    const parts = monthStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Compute all metrics for a category envelope for a specific month
function calculateCategoryBudget(budget, monthStr) {
    const fixedAmount = parseFloat(budget.monthlyLimit) || 0;
    const rolloverIn = (budget.rollovers && parseFloat(budget.rollovers[monthStr])) || 0;
    const totalAllowed = fixedAmount + rolloverIn;

    // Actual spent for this category in this month
    let spent = 0;
    state.transactions.forEach(t => {
        if (t.type === "expense" && t.category === budget.category && t.date.startsWith(monthStr)) {
            spent += t.amount;
        }
    });

    const remaining = totalAllowed - spent;
    const leftover = Math.max(0, remaining);
    const nextMonth = getNextMonth(monthStr);
    const alreadyRolledToNext = (budget.rollovers && parseFloat(budget.rollovers[nextMonth])) || 0;

    const pct = totalAllowed > 0 ? Math.round((spent / totalAllowed) * 100) : 0;
    const status = pct >= 100 ? "danger" : (pct >= 75 ? "warning" : "safe");

    return {
        id: budget.id,
        category: budget.category,
        notes: budget.notes || "",
        fixedAmount,
        rolloverIn,
        totalAllowed,
        spent,
        remaining,
        leftover,
        nextMonth,
        alreadyRolledToNext,
        pct,
        status
    };
}

// Render the dedicated Monthly Budgets page view
function renderBudgets() {
    const monthStr = state.budgetViewMonth;
    const monthDisplay = document.getElementById("budgetMonthDisplay");
    if (monthDisplay) {
        monthDisplay.innerText = formatMonthLabel(monthStr);
    }

    let totalFixed = 0;
    let totalRolloverIn = 0;
    let totalAllowed = 0;
    let totalSpent = 0;
    let totalLeftover = 0;

    const container = document.getElementById("budgetsGrid");
    if (!container) return;
    container.innerHTML = "";

    const activeBudgets = state.categoryBudgets || [];

    if (activeBudgets.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border);">
                <div style="font-size: 40px; margin-bottom: 12px;">📊</div>
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">No Monthly Budgets Created Yet</h3>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto 20px auto; font-size: 14px;">
                    Set fixed monthly limits for your expense categories (Food, Shopping, etc.). Each budget refreshes every month, and you can roll over leftover money to next month with one click!
                </p>
                <button class="btn btn-primary" id="emptyAddBudgetBtn"><i data-lucide="plus"></i> Create Starter Budgets</button>
            </div>
        `;
        document.getElementById("emptyAddBudgetBtn")?.addEventListener("click", () => {
            state.categoryBudgets = db.getCategoryBudgets();
            renderBudgets();
            ui.refreshIcons();
        });
    } else {
        activeBudgets.forEach(b => {
            const data = calculateCategoryBudget(b, monthStr);

            totalFixed += data.fixedAmount;
            totalRolloverIn += data.rolloverIn;
            totalAllowed += data.totalAllowed;
            totalSpent += data.spent;
            totalLeftover += data.leftover;

            const prevMonthName = formatMonthLabel(getPrevMonth(monthStr));
            const nextMonthName = formatMonthLabel(data.nextMonth);

            const iconHtml = ui.categoryIcons[data.category] || "wallet";

            const card = document.createElement("div");
            card.className = `budget-card status-${data.status}`;

            // Rollover CTA button state
            let rolloverBtnHtml = "";
            if (data.leftover > 0) {
                if (data.alreadyRolledToNext > 0) {
                    rolloverBtnHtml = `
                        <button class="btn-rollover already-rolled" onclick="window.appOpenRolloverModal('${b.id}')">
                            <i data-lucide="check-circle-2"></i> Rolled over ${ui.formatCurrency(data.alreadyRolledToNext)} to ${nextMonthName} (Adjust)
                        </button>
                    `;
                } else {
                    rolloverBtnHtml = `
                        <button class="btn-rollover" onclick="window.appOpenRolloverModal('${b.id}')">
                            <i data-lucide="arrow-right-circle"></i> Add Leftover (${ui.formatCurrency(data.leftover)}) to Next Month
                        </button>
                    `;
                }
            } else {
                rolloverBtnHtml = `
                    <button class="btn-rollover" disabled title="No leftover funds remaining in this month">
                        <i data-lucide="minus-circle"></i> No leftover to rollover
                    </button>
                `;
            }

            card.innerHTML = `
                <div>
                    <div class="budget-card-header">
                        <div class="budget-card-title-group">
                            <div class="budget-icon-box">
                                <i data-lucide="${iconHtml}"></i>
                            </div>
                            <div>
                                <div class="budget-card-name">${data.category}</div>
                                <div class="budget-card-notes">${data.notes || 'Monthly category envelope'}</div>
                            </div>
                        </div>
                        <div class="budget-header-actions">
                            <button class="btn-icon-subtle" onclick="window.appEditBudget('${b.id}')" title="Edit Budget">
                                <i data-lucide="edit-3" style="width: 16px; height: 16px;"></i>
                            </button>
                            <button class="btn-icon-subtle danger" onclick="window.appDeleteBudget('${b.id}')" title="Delete Budget">
                                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                            </button>
                        </div>
                    </div>

                    <div class="budget-badges-row">
                        <span class="budget-badge fixed" title="Refreshes automatically each month">
                            <i data-lucide="refresh-cw" style="width: 12px; height: 12px;"></i> Fixed: ${ui.formatCurrency(data.fixedAmount)}/mo
                        </span>
                        ${data.rolloverIn > 0 ? `
                            <span class="budget-badge rollover" title="Carried over from ${prevMonthName}">
                                <i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> +${ui.formatCurrency(data.rolloverIn)} from prev mo
                            </span>
                        ` : ''}
                        <span class="budget-badge status-pill badge-${data.status === 'safe' ? 'income' : (data.status === 'warning' ? 'warning' : 'danger')}">
                            ${data.pct}% used
                        </span>
                    </div>

                    <div class="budget-spending-display">
                        <div class="budget-amounts-row">
                            <div>
                                <span style="font-size: 11px; color: var(--text-muted); display: block; font-weight: 600;">SPENT THIS MONTH</span>
                                <span class="budget-spent-amount">${ui.formatCurrency(data.spent)}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="font-size: 11px; color: var(--text-muted); display: block; font-weight: 600;">ALLOWED BUDGET</span>
                                <span class="budget-total-allowed">${ui.formatCurrency(data.totalAllowed)}</span>
                            </div>
                        </div>

                        <div class="budget-progress-track">
                            <div class="budget-progress-fill ${data.status}" style="width: ${Math.min(100, data.pct)}%;"></div>
                        </div>

                        <div class="budget-remaining-text">
                            ${data.remaining >= 0 ? `
                                <span class="text-success"><i data-lucide="check" style="width: 13px; height: 13px; display:inline; vertical-align:middle;"></i> ${ui.formatCurrency(data.remaining)} left to spend</span>
                                <span style="color: var(--text-muted); font-size: 11px;">Cap: ${ui.formatCurrency(data.totalAllowed)}</span>
                            ` : `
                                <span class="text-danger"><i data-lucide="alert-octagon" style="width: 13px; height: 13px; display:inline; vertical-align:middle;"></i> Over budget by ${ui.formatCurrency(Math.abs(data.remaining))}</span>
                                <span style="color: var(--danger); font-size: 11px; font-weight: 800;">LIMIT EXCEEDED</span>
                            `}
                        </div>
                    </div>
                </div>

                <div class="budget-card-footer">
                    ${rolloverBtnHtml}
                </div>
            `;

            container.appendChild(card);
        });
    }

    // Update Top Summary Stats
    const elFixed = document.getElementById("budgetTotalFixed");
    const elRollover = document.getElementById("budgetTotalRolloverIn");
    const elAllowed = document.getElementById("budgetTotalAllowed");
    const elSpent = document.getElementById("budgetTotalSpent");
    const elLeftover = document.getElementById("budgetTotalLeftover");

    if (elFixed) elFixed.innerText = ui.formatCurrency(totalFixed);
    if (elRollover) elRollover.innerText = (totalRolloverIn > 0 ? "+" : "") + ui.formatCurrency(totalRolloverIn);
    if (elAllowed) elAllowed.innerText = ui.formatCurrency(totalAllowed);
    if (elSpent) elSpent.innerText = ui.formatCurrency(totalSpent);
    if (elLeftover) elLeftover.innerText = ui.formatCurrency(totalLeftover);
}

// Render Dashboard mini envelopes
function renderDashboardBudgets() {
    const container = document.getElementById("dashBudgetsContainer");
    if (!container) return;
    container.innerHTML = "";

    const currentMonthStr = new Date().toISOString().substring(0, 7);
    const budgets = state.categoryBudgets || [];

    if (budgets.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 13px;">No category budgets set. <a href="#budgets" style="color:var(--primary-dark); font-weight:700;">Create monthly budget</a></div>`;
        return;
    }

    budgets.forEach(b => {
        const data = calculateCategoryBudget(b, currentMonthStr);
        const iconName = ui.categoryIcons[data.category] || "wallet";

        const item = document.createElement("div");
        item.className = "dash-budget-item";
        item.innerHTML = `
            <div class="dash-budget-top">
                <span class="dash-budget-category">
                    <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: var(--primary-dark);"></i>
                    ${data.category}
                </span>
                <span class="dash-budget-remaining ${data.remaining >= 0 ? 'text-success' : 'text-danger'}">
                    ${data.remaining >= 0 ? ui.formatCurrency(data.remaining) + ' left' : 'Over by ' + ui.formatCurrency(Math.abs(data.remaining))}
                </span>
            </div>
            <div class="budget-progress-track" style="height: 6px;">
                <div class="budget-progress-fill ${data.status}" style="width: ${Math.min(100, data.pct)}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
                <span>Spent: ${ui.formatCurrency(data.spent)}</span>
                <span>Allowed: ${ui.formatCurrency(data.totalAllowed)}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// Live Hint in Transaction Form
function updateTxBudgetHint() {
    const hintEl = document.getElementById("txBudgetHint");
    if (!hintEl) return;

    const type = document.getElementById("txType")?.value;
    if (type !== "expense") {
        hintEl.style.display = "none";
        return;
    }

    const cat = document.getElementById("txCategory")?.value;
    const dateVal = document.getElementById("txDate")?.value || new Date().toISOString().split("T")[0];
    const monthStr = dateVal.substring(0, 7);
    const amountVal = parseFloat(document.getElementById("txAmount")?.value) || 0;

    const budget = (state.categoryBudgets || []).find(b => b.category === cat);
    if (!budget) {
        hintEl.style.display = "none";
        return;
    }

    const bData = calculateCategoryBudget(budget, monthStr);
    hintEl.style.display = "flex";

    if (amountVal > 0 && amountVal > bData.remaining) {
        hintEl.className = "tx-budget-hint danger";
        hintEl.innerHTML = `
            <i data-lucide="alert-octagon" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>⚠️ Will exceed monthly <strong>${cat}</strong> budget by ${ui.formatCurrency(amountVal - bData.remaining)}! (Available: ${ui.formatCurrency(Math.max(0, bData.remaining))})</span>
        `;
    } else if (bData.remaining <= 0) {
        hintEl.className = "tx-budget-hint danger";
        hintEl.innerHTML = `
            <i data-lucide="alert-octagon" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>⚠️ Monthly <strong>${cat}</strong> budget limit reached (${ui.formatCurrency(bData.spent)} of ${ui.formatCurrency(bData.totalAllowed)} spent).</span>
        `;
    } else {
        hintEl.className = "tx-budget-hint safe";
        hintEl.innerHTML = `
            <i data-lucide="check-circle" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span>Monthly <strong>${cat}</strong> Budget: <strong>${ui.formatCurrency(bData.remaining)}</strong> left to spend of ${ui.formatCurrency(bData.totalAllowed)}.</span>
        `;
    }
    ui.refreshIcons();
}

// Live Math Preview in Rollover Modal
function updateRolloverPreview() {
    const amt = parseFloat(document.getElementById("rolloverAmount")?.value) || 0;
    const base = parseFloat(document.getElementById("rolloverPreviewBase")?.dataset.baseVal) || 0;
    const addedEl = document.getElementById("rolloverPreviewAdded");
    const totalEl = document.getElementById("rolloverPreviewTotal");
    if (addedEl) addedEl.innerText = "+" + ui.formatCurrency(amt);
    if (totalEl) totalEl.innerText = ui.formatCurrency(base + amt);
}

// Helper to execute and commit transaction
function executeAddTransaction(newTx, accountId) {
    const acc = state.accounts.find(a => a.id === accountId);
    if (acc) {
        if (newTx.type === "income") {
            acc.balance += newTx.amount;
        } else {
            acc.balance -= newTx.amount;
        }
        db.saveAccounts(state.accounts);
    }

    state.transactions.push(newTx);
    db.saveTransactions(state.transactions);

    ui.closeModal("#addTransactionModal");
    renderPage(window.location.hash.replace("#", "") || "dashboard");
}

// Setup event listeners for the Budget system
function setupBudgetListeners() {
    // Month navigation
    document.getElementById("budgetPrevMonthBtn")?.addEventListener("click", () => {
        state.budgetViewMonth = getPrevMonth(state.budgetViewMonth);
        renderBudgets();
        ui.refreshIcons();
    });

    document.getElementById("budgetNextMonthBtn")?.addEventListener("click", () => {
        state.budgetViewMonth = getNextMonth(state.budgetViewMonth);
        renderBudgets();
        ui.refreshIcons();
    });

    document.getElementById("budgetTodayBtn")?.addEventListener("click", () => {
        state.budgetViewMonth = new Date().toISOString().substring(0, 7);
        renderBudgets();
        ui.refreshIcons();
    });

    // Add Budget Modal
    document.getElementById("openAddBudgetModalBtn")?.addEventListener("click", () => {
        document.getElementById("budgetForm").reset();
        document.getElementById("budgetId").value = "";
        document.getElementById("budgetModalTitle").innerText = "Add Monthly Budget";
        document.getElementById("budgetCustomCategoryGroup").style.display = "none";
        document.getElementById("budgetCustomCategory").required = false;
        ui.openModal("#budgetModal");
    });

    document.getElementById("cancelBudgetBtn")?.addEventListener("click", () => {
        ui.closeModal("#budgetModal");
    });

    document.getElementById("budgetCategorySelect")?.addEventListener("change", function () {
        const customGroup = document.getElementById("budgetCustomCategoryGroup");
        const customInput = document.getElementById("budgetCustomCategory");
        if (this.value === "__custom__") {
            customGroup.style.display = "block";
            customInput.required = true;
            customInput.focus();
        } else {
            customGroup.style.display = "none";
            customInput.required = false;
        }
    });

    document.getElementById("budgetForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("budgetId").value;
        const catSelect = document.getElementById("budgetCategorySelect").value;
        const customCat = document.getElementById("budgetCustomCategory").value.trim();
        const category = catSelect === "__custom__" ? customCat : catSelect;
        const monthlyLimit = parseFloat(document.getElementById("budgetMonthlyLimit").value);
        const notes = document.getElementById("budgetNotes").value.trim();

        if (!category) {
            alert("Please specify a category name!");
            return;
        }
        if (isNaN(monthlyLimit) || monthlyLimit <= 0) {
            alert("Please enter a valid monthly budget limit!");
            return;
        }

        if (id) {
            // Edit existing
            const item = state.categoryBudgets.find(b => b.id === id);
            if (item) {
                item.category = category;
                item.monthlyLimit = monthlyLimit;
                item.notes = notes;
            }
        } else {
            // Check if budget for category already exists
            const existing = state.categoryBudgets.find(b => b.category.toLowerCase() === category.toLowerCase());
            if (existing) {
                alert(`A monthly budget for "${category}" already exists! You can edit its monthly limit.`);
                return;
            }
            state.categoryBudgets.push({
                id: "cb-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
                category,
                monthlyLimit,
                rollovers: {},
                notes,
                createdAt: new Date().toISOString()
            });
        }

        db.saveCategoryBudgets(state.categoryBudgets);
        ui.closeModal("#budgetModal");
        renderBudgets();
        renderDashboard();
        ui.refreshIcons();
    });

    // Rollover Modal
    const rolloverAmtInput = document.getElementById("rolloverAmount");
    rolloverAmtInput?.addEventListener("input", updateRolloverPreview);

    document.getElementById("rolloverAllBtn")?.addEventListener("click", () => {
        const leftoverVal = parseFloat(document.getElementById("rolloverAmount").dataset.maxLeftover) || 0;
        document.getElementById("rolloverAmount").value = leftoverVal.toFixed(2);
        updateRolloverPreview();
    });

    document.getElementById("cancelRolloverBtn")?.addEventListener("click", () => {
        ui.closeModal("#rolloverModal");
    });

    document.getElementById("rolloverForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const budgetId = document.getElementById("rolloverBudgetId").value;
        const toMonth = document.getElementById("rolloverToMonth").value;
        const amount = parseFloat(document.getElementById("rolloverAmount").value);

        if (isNaN(amount) || amount < 0) {
            alert("Please enter a valid rollover amount!");
            return;
        }

        const budget = state.categoryBudgets.find(b => b.id === budgetId);
        if (!budget) return;

        budget.rollovers = budget.rollovers || {};
        budget.rollovers[toMonth] = amount;

        db.saveCategoryBudgets(state.categoryBudgets);
        ui.closeModal("#rolloverModal");

        renderBudgets();
        renderDashboard();
        ui.refreshIcons();

        alert(`✓ Added ${ui.formatCurrency(amount)} leftover money to ${budget.category} budget for ${formatMonthLabel(toMonth)}!`);
    });

    // Quick Rollover All
    document.getElementById("quickRolloverAllBtn")?.addEventListener("click", () => {
        const monthStr = state.budgetViewMonth;
        const nextMonth = getNextMonth(monthStr);
        let count = 0;
        let totalRolled = 0;

        state.categoryBudgets.forEach(b => {
            const bData = calculateCategoryBudget(b, monthStr);
            if (bData.leftover > 0) {
                b.rollovers = b.rollovers || {};
                b.rollovers[nextMonth] = bData.leftover;
                totalRolled += bData.leftover;
                count++;
            }
        });

        if (count === 0) {
            alert("No category budgets have remaining leftover funds in this month to roll over.");
            return;
        }

        db.saveCategoryBudgets(state.categoryBudgets);
        renderBudgets();
        renderDashboard();
        ui.refreshIcons();
        alert(`✓ Rolled over a total of ${ui.formatCurrency(totalRolled)} leftover funds across ${count} categories into ${formatMonthLabel(nextMonth)}!`);
    });

    // Budget Cap Warning Modal actions
    document.getElementById("capOverrideBtn")?.addEventListener("click", () => {
        if (pendingExpenseAction) {
            const action = pendingExpenseAction;
            pendingExpenseAction = null;
            ui.closeModal("#budgetCapExceededModal");
            action();
        }
    });

    document.getElementById("capCancelBtn")?.addEventListener("click", () => {
        pendingExpenseAction = null;
        ui.closeModal("#budgetCapExceededModal");
    });
}

// Window methods for dynamic card buttons
window.appOpenRolloverModal = function (budgetId) {
    const budget = state.categoryBudgets.find(b => b.id === budgetId);
    if (!budget) return;

    const bData = calculateCategoryBudget(budget, state.budgetViewMonth);
    const nextMonth = bData.nextMonth;

    document.getElementById("rolloverBudgetId").value = budget.id;
    document.getElementById("rolloverFromMonth").value = state.budgetViewMonth;
    document.getElementById("rolloverToMonth").value = nextMonth;
    document.getElementById("rolloverFromMonthLabel").innerText = formatMonthLabel(state.budgetViewMonth);
    document.getElementById("rolloverToMonthLabel").innerText = formatMonthLabel(nextMonth);
    document.getElementById("rolloverCategoryName").innerText = budget.category;
    document.getElementById("rolloverLeftoverAvailable").innerText = ui.formatCurrency(bData.leftover);

    const rolloverInput = document.getElementById("rolloverAmount");
    rolloverInput.dataset.maxLeftover = bData.leftover;
    const initialAmt = bData.alreadyRolledToNext > 0 ? bData.alreadyRolledToNext : bData.leftover;
    rolloverInput.value = initialAmt.toFixed(2);

    const baseEl = document.getElementById("rolloverPreviewBase");
    baseEl.innerText = ui.formatCurrency(bData.fixedAmount);
    baseEl.dataset.baseVal = bData.fixedAmount;

    updateRolloverPreview();
    ui.openModal("#rolloverModal");
    ui.refreshIcons();
};

window.appEditBudget = function (budgetId) {
    const budget = state.categoryBudgets.find(b => b.id === budgetId);
    if (!budget) return;

    document.getElementById("budgetId").value = budget.id;
    document.getElementById("budgetModalTitle").innerText = "Edit Monthly Budget";
    document.getElementById("budgetMonthlyLimit").value = budget.monthlyLimit;
    document.getElementById("budgetNotes").value = budget.notes || "";

    const catSelect = document.getElementById("budgetCategorySelect");
    const customGroup = document.getElementById("budgetCustomCategoryGroup");
    const customInput = document.getElementById("budgetCustomCategory");

    const optionExists = Array.from(catSelect.options).some(o => o.value === budget.category);
    if (optionExists) {
        catSelect.value = budget.category;
        customGroup.style.display = "none";
        customInput.required = false;
    } else {
        catSelect.value = "__custom__";
        customGroup.style.display = "block";
        customInput.value = budget.category;
        customInput.required = true;
    }

    ui.openModal("#budgetModal");
};

window.appDeleteBudget = function (budgetId) {
    const budget = state.categoryBudgets.find(b => b.id === budgetId);
    if (!budget) return;

    if (confirm(`Are you sure you want to remove the monthly budget for "${budget.category}"?`)) {
        state.categoryBudgets = state.categoryBudgets.filter(b => b.id !== budgetId);
        db.saveCategoryBudgets(state.categoryBudgets);
        renderBudgets();
        renderDashboard();
        ui.refreshIcons();
    }
};


/* =========================================================================
   EVENT LISTENER BINDINGS MODULES
   ========================================================================= */
function setupEventListeners() {
    // --- AUTHENTICATION EVENTS ---
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const user = document.getElementById("loginUser").value;
            const pass = document.getElementById("loginPass").value;
            try {
                await auth.login(user, pass);
                await db.loadFromServer(); // Load specific remote database state
                checkAuthSession();
                window.location.hash = "#dashboard";
                handleRouting();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const user = document.getElementById("signupUser").value;
            const pass = document.getElementById("signupPass").value;
            const confirmPass = document.getElementById("signupConfirmPass").value;

            if (pass !== confirmPass) {
                alert("Passwords do not match!");
                return;
            }

            try {
                await auth.register(user, pass);
                alert("Registration successful! Please log in.");
                // Switch forms
                document.getElementById("signupFormContainer").style.display = "none";
                document.getElementById("loginFormContainer").style.display = "block";
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // Toggle register/login links
    document.getElementById("toRegister")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("loginFormContainer").style.display = "none";
        document.getElementById("signupFormContainer").style.display = "block";
    });

    document.getElementById("toLogin")?.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("signupFormContainer").style.display = "none";
        document.getElementById("loginFormContainer").style.display = "block";
    });

    // --- SIDEBAR / PROFILE SIGN OUT ---
    document.getElementById("sidebarSignOutBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (confirm("Sign out of your session?")) {
            auth.logout();
            db.clearCache();
            checkAuthSession();
        }
    });

    // --- TRANSACTIONS TAB FILTERS ---
    document.querySelectorAll(".tx-filter-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tx-filter-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.currentFilter = tab.getAttribute("data-filter");
            renderTransactions();
        });
    });

    // --- MODAL TRIGGER BINDINGS ---
    // Setup budget system listeners
    setupBudgetListeners();

    // A. Add Transaction Modal
    document.getElementById("openAddTxModalBtn")?.addEventListener("click", () => {
        ui.openModal("#addTransactionModal");
        updateTxBudgetHint();
    });
    
    document.getElementById("cancelAddTxBtn")?.addEventListener("click", () => {
        ui.closeModal("#addTransactionModal");
    });

    // Real-time live budget feedback when typing transaction
    ["txType", "txCategory", "txDate", "txAmount"].forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener("input", updateTxBudgetHint);
        el?.addEventListener("change", updateTxBudgetHint);
    });

    document.getElementById("addTxForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const type = document.getElementById("txType").value;
        const amount = parseFloat(document.getElementById("txAmount").value);
        const category = document.getElementById("txCategory").value;
        const date = document.getElementById("txDate").value;
        const description = document.getElementById("txDesc").value;
        const accountId = document.getElementById("txAccount").value;

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount!");
            return;
        }

        const newTx = {
            id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            type,
            amount,
            category,
            date,
            description,
            accountId
        };

        // Monthly Budget Spending Cap check
        if (type === "expense") {
            const budget = (state.categoryBudgets || []).find(b => b.category === category);
            if (budget) {
                const bData = calculateCategoryBudget(budget, date.substring(0, 7));
                if (amount > bData.remaining) {
                    // Budget exceeded - show warning modal
                    document.getElementById("capCategoryName").innerText = category;
                    document.getElementById("capMonthName").innerText = formatMonthLabel(date.substring(0, 7));
                    document.getElementById("capTotalBudget").innerText = ui.formatCurrency(bData.totalAllowed);
                    document.getElementById("capAlreadySpent").innerText = ui.formatCurrency(bData.spent);
                    document.getElementById("capRemainingBudget").innerText = ui.formatCurrency(Math.max(0, bData.remaining));
                    document.getElementById("capThisTxAmount").innerText = ui.formatCurrency(amount);
                    document.getElementById("capOverAmount").innerText = ui.formatCurrency(amount - bData.remaining);

                    pendingExpenseAction = () => {
                        executeAddTransaction(newTx, accountId);
                    };

                    ui.openModal("#budgetCapExceededModal");
                    return;
                }
            }
        }

        executeAddTransaction(newTx, accountId);
    });

    // B. Deposit / Withdraw Modal
    document.getElementById("cancelDWBtn")?.addEventListener("click", () => {
        ui.closeModal("#depositWithdrawModal");
    });

    document.getElementById("dwForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const accId = document.getElementById("dwAccountId").value;
        const action = document.getElementById("dwActionType").value; // deposit / withdraw
        const amount = parseFloat(document.getElementById("dwAmount").value);
        const note = document.getElementById("dwNote").value || (action === "deposit" ? "Cash Deposit" : "Cash Withdrawal");

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount!");
            return;
        }

        const acc = state.accounts.find(a => a.id === accId);
        if (!acc) return;

        if (action === "withdraw" && acc.balance < amount) {
            alert("Insufficient funds in this account!");
            return;
        }

        // Deduct/Add
        if (action === "deposit") {
            acc.balance += amount;
        } else {
            acc.balance -= amount;
        }
        db.saveAccounts(state.accounts);

        // Log transaction
        const newTx = {
            id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            type: action === "deposit" ? "income" : "expense",
            amount,
            category: "Transfer",
            date: new Date().toISOString().split("T")[0],
            description: `${action === "deposit" ? "Deposit" : "Withdrawal"}: ${acc.name} (${note})`,
            accountId: acc.id
        };
        state.transactions.push(newTx);
        db.saveTransactions(state.transactions);

        ui.closeModal("#depositWithdrawModal");
        renderPage("accounts");
    });

    // C. Add Account Card Modal
    document.getElementById("openAddAccModalBtn")?.addEventListener("click", () => {
        ui.openModal("#addAccountModal");
    });

    document.getElementById("cancelAddAccBtn")?.addEventListener("click", () => {
        ui.closeModal("#addAccountModal");
    });

    document.getElementById("addAccForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("accName").value;
        const type = document.getElementById("accType").value;
        const balance = parseFloat(document.getElementById("accBalance").value) || 0;

        const newAcc = {
            id: "acc-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            name,
            type,
            balance
        };

        state.accounts.push(newAcc);
        db.saveAccounts(state.accounts);

        ui.closeModal("#addAccountModal");
        renderAccounts();
    });

    // D. Add Recurring Bills Modal
    document.getElementById("openAddRecModalBtn")?.addEventListener("click", () => {
        ui.openModal("#addRecurringModal");
    });

    document.getElementById("cancelAddRecBtn")?.addEventListener("click", () => {
        ui.closeModal("#addRecurringModal");
    });

    document.getElementById("addRecForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("recName").value;
        const amount = parseFloat(document.getElementById("recAmount").value);
        const category = document.getElementById("recCategory").value;
        const frequency = document.getElementById("recFrequency").value;
        const date = document.getElementById("recDueDate").value;
        const accountId = document.getElementById("recAccount").value;

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount!");
            return;
        }

        const newRec = {
            id: "rec-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            name,
            amount,
            category,
            frequency,
            nextDueDate: date,
            accountId
        };

        state.recurring.push(newRec);
        db.saveRecurring(state.recurring);

        ui.closeModal("#addRecurringModal");
        renderRecurring();
    });

    // E. Add Loan Modal
    document.getElementById("openAddLoanModalBtn")?.addEventListener("click", () => {
        ui.openModal("#addLoanModal");
    });

    document.getElementById("cancelAddLoanBtn")?.addEventListener("click", () => {
        ui.closeModal("#addLoanModal");
    });

    document.getElementById("addLoanForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const person = document.getElementById("loanPerson").value;
        const type = document.getElementById("loanType").value;
        const amount = parseFloat(document.getElementById("loanAmount").value);
        const dueDate = document.getElementById("loanDueDate").value;
        const description = document.getElementById("loanDesc").value;

        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount!");
            return;
        }

        const newLoan = {
            id: "loan-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            person,
            type,
            amount,
            dueDate,
            description,
            settled: false
        };

        state.loans.push(newLoan);
        db.saveLoans(state.loans);

        ui.closeModal("#addLoanModal");
        renderLoans();
    });

    // F. Add Wishlist Item Modal
    document.getElementById("openAddWishModalBtn")?.addEventListener("click", () => {
        ui.openModal("#addWishModal");
    });

    document.getElementById("cancelAddWishBtn")?.addEventListener("click", () => {
        ui.closeModal("#addWishModal");
    });

    document.getElementById("addWishForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("wishName").value;
        const price = parseFloat(document.getElementById("wishPrice").value);
        const link = document.getElementById("wishLink").value || "#";
        const notes = document.getElementById("wishNotes").value;

        if (isNaN(price) || price <= 0) {
            alert("Please enter a valid amount!");
            return;
        }

        const newWish = {
            id: "wish-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            name,
            price,
            link,
            notes
        };

        state.wishlist.push(newWish);
        db.saveWishlist(state.wishlist);

        ui.closeModal("#addWishModal");
        renderWishlist();
    });

    // G. Settings Form Save
    document.getElementById("settingsForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const monthlyBudget = parseFloat(document.getElementById("setBudget").value);
        const profileType = document.getElementById("setProfile").value;

        if (isNaN(monthlyBudget) || monthlyBudget <= 0) {
            alert("Please enter a valid monthly budget limit!");
            return;
        }

        const updated = { monthlyBudget, profileType };
        db.saveSettings(updated);

        // Refresh roles card
        document.getElementById("sidebarRole").innerText = profileType + " Profile";

        alert("Settings updated successfully!");
        loadStateFromDb();
        renderSettings();
    });

    // --- AI RECEIPT SCANNER BINDINGS ---
    const dropzone = document.getElementById("scannerDropzone");
    const fileInput = document.getElementById("receiptFileInput");

    // Click triggers file selector
    dropzone?.addEventListener("click", () => {
        fileInput.click();
    });

    // Drag-Drop handlers
    dropzone?.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("scanner-drag-active");
    });

    dropzone?.addEventListener("dragleave", () => {
        dropzone.classList.remove("scanner-drag-active");
    });

    dropzone?.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("scanner-drag-active");
        if (e.dataTransfer.files.length > 0) {
            scanner.initiateScan(e.dataTransfer.files[0], onReceiptScanFinish);
        }
    });

    // File Selector Change
    fileInput?.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            scanner.initiateScan(e.target.files[0], onReceiptScanFinish);
        }
    });

    // Reset scanner click
    document.getElementById("scannerResetBtn")?.addEventListener("click", () => {
        scanner.reset();
    });

    // --- BACKUP EXPORT & IMPORT ---
    document.getElementById("settingsExportBtn")?.addEventListener("click", () => {
        db.exportBackup();
    });

    const importInput = document.getElementById("importFileInput");
    document.getElementById("settingsImportBtn")?.addEventListener("click", () => {
        importInput.click();
    });

    importInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            if (confirm("Importing this backup will overwrite your current storage data. Do you wish to proceed?")) {
                const success = db.importBackup(evt.target.result);
                if (success) {
                    alert("Data imported successfully! Loading updated state...");
                    loadStateFromDb();
                    renderPage(window.location.hash.replace("#", "") || "dashboard");
                }
            }
            importInput.value = ""; // clear selector
        };
        reader.readAsText(file);
    });
}

// Callback when scanning finishes
function onReceiptScanFinish(extractedData) {
    // Populate Verify OCR modal form
    document.getElementById("ocrDesc").value = extractedData.description;
    document.getElementById("ocrCategory").value = extractedData.category;
    document.getElementById("ocrAmount").value = extractedData.amount;
    document.getElementById("ocrDate").value = extractedData.date;

    // Load available accounts inside select option
    const ocrAcc = document.getElementById("ocrAccount");
    ocrAcc.innerHTML = "";
    state.accounts.forEach(a => {
        ocrAcc.innerHTML += `<option value="${a.id}">${a.name}</option>`;
    });

    // Open verification Modal
    ui.openModal("#verifyOcrModal");

    // Settle confirmation action
    const saveBtn = document.getElementById("confirmOcrBtn");
    // Remove old listeners by cloning
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener("click", () => {
        const desc = document.getElementById("ocrDesc").value;
        const cat = document.getElementById("ocrCategory").value;
        const amt = parseFloat(document.getElementById("ocrAmount").value);
        const dt = document.getElementById("ocrDate").value;
        const accId = document.getElementById("ocrAccount").value;

        if (isNaN(amt) || amt <= 0) {
            alert("Invalid amount!");
            return;
        }

        // Apply deduction to account
        const account = state.accounts.find(a => a.id === accId);
        if (account) {
            account.balance -= amt;
            db.saveAccounts(state.accounts);
        }

        // Save transaction
        const newTx = {
            id: "tx-" + Math.random().toString(36).substring(2) + Date.now().toString(36),
            type: "expense",
            amount: amt,
            category: cat,
            date: dt,
            description: desc,
            accountId: accId
        };

        // Monthly Budget Spending Cap check for OCR
        const budget = (state.categoryBudgets || []).find(b => b.category === cat);
        if (budget) {
            const bData = calculateCategoryBudget(budget, dt.substring(0, 7));
            if (amt > bData.remaining) {
                document.getElementById("capCategoryName").innerText = cat;
                document.getElementById("capMonthName").innerText = formatMonthLabel(dt.substring(0, 7));
                document.getElementById("capTotalBudget").innerText = ui.formatCurrency(bData.totalAllowed);
                document.getElementById("capAlreadySpent").innerText = ui.formatCurrency(bData.spent);
                document.getElementById("capRemainingBudget").innerText = ui.formatCurrency(Math.max(0, bData.remaining));
                document.getElementById("capThisTxAmount").innerText = ui.formatCurrency(amt);
                document.getElementById("capOverAmount").innerText = ui.formatCurrency(amt - bData.remaining);

                pendingExpenseAction = () => {
                    executeAddTransaction(newTx, accId);
                    ui.closeModal("#verifyOcrModal");
                    scanner.reset();
                    alert("Receipt transaction logged successfully!");
                    renderPage("transactions");
                };

                ui.openModal("#budgetCapExceededModal");
                return;
            }
        }

        executeAddTransaction(newTx, accId);
        ui.closeModal("#verifyOcrModal");
        scanner.reset();
        alert("Receipt transaction logged successfully!");
        renderPage("transactions");
    });

    document.getElementById("cancelOcrBtn")?.addEventListener("click", () => {
        ui.closeModal("#verifyOcrModal");
        scanner.reset();
    });
}
