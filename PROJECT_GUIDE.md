# AuraFinance — Complete Project Architecture & Developer Guide

> **Important**: Read this document thoroughly before building or modifying any features in this codebase. It documents the application's purpose, design philosophy, architecture, data flow, features, and developer conventions.

---

## 1. Project Overview & Purpose

**AuraFinance** is a modern, privacy-focused, single-page personal finance and wealth management web application. It combines traditional cash/bank tracking with envelope budgeting, subscription reminders, peer-to-peer loan tracking, and intelligent spending recommendations.

### Key Capabilities:
* **Real-time Balance & Net Worth Overview**: Aggregates bank accounts, cash wallets, and crypto assets into a unified net worth figure.
* **Monthly Budget Envelopes & Leftover Rollover**: Fixed monthly allowances per category that automatically refresh each month, with strict overspending warnings and 1-click rollover of unspent money into the next month.
* **Transaction Ledger**: Filterable, categorized income and expense log with automatic account balance reconciliation.
* **Recurring Subscriptions & Bills**: Automated due date tracking for recurring bills with instant payment settlement.
* **Peer-to-Peer Loans (IOUs)**: Tracks money lent to others (*They owe me*) and money borrowed (*I owe them*), alerting on overdue debt.
* **Smart Wishlist & Decision Engine**: Evaluates desired purchases against the user's live Net Worth, current month's remaining budget, and savings profile (*Frugal*, *Balanced*, or *Splurger*).
* **AI Receipt OCR Scanner (Simulated)**: Visual receipt scanner with parsing animation and automated transaction extraction.
* **Data Isolation & Offline Resilience**: Local memory cache backed by browser `localStorage` and synchronized with an isolated per-user JSON database on a lightweight Node.js Express server.

---

## 2. Technology Stack

| Layer | Technologies | Notes |
|---|---|---|
| **Frontend UI** | HTML5 Semantic Layout | Clean SPA structure with view switching via CSS classes |
| **Styling** | Vanilla CSS3 | Custom design system using CSS Variables, glassmorphism, responsive grid |
| **Client Logic** | Vanilla JavaScript (ES Modules) | Native ES modules (`import`/`export`), no heavy frontend frameworks |
| **Visualizations** | Chart.js (CDN) | Interactive bar charts (Income vs Expense) and doughnut charts (Category split) |
| **Icons** | Lucide Icons (CDN) | Rendered with `data-lucide` and dynamically initialized via `ui.refreshIcons()` |
| **Backend API** | Node.js + Express (`server.js`) | RESTful API for authentication and full-database JSON synchronization |
| **Storage Engine** | JSON Flat-file Database | Server stores isolated records in `data/user_<username>.json` |
| **Security** | Double SHA-256 Hashing | Client hashes password first; server salts and hashes it before storage |

---

## 3. Directory Structure & Key Files

```
Money tracker/
├── data/                         # Server-side flat-file JSON database
│   ├── users.json                # User registry & hashed credentials
│   ├── user_alex.json            # Alex's isolated financial records
│   ├── user_sidd.json            # Sidd's isolated financial records
│   └── user_<username>.json      # Auto-created for newly registered users
│
├── js/                           # Client-side JavaScript modules
│   ├── api.js                    # Remote HTTP client (Fetch wrapper with Bearer tokens)
│   ├── app.js                    # Core application router, page renderers & event listeners
│   ├── auth.js                   # Client-side session management & SHA-256 password hashing
│   ├── db.js                     # In-memory database cache, local backup & server sync
│   ├── scanner.js                # Simulated AI OCR receipt scanning worker
│   └── ui.js                     # UI formatters (currency, dates, badges, icons, modal helpers)
│
├── index.html                    # Single Page App structure (navigation, all page views, modals)
├── style.css                     # Complete design system & responsive styling
├── server.js                     # Express backend server (auth endpoints & data persistence)
├── package.json                  # Node.js dependencies (`express`, `cors`)
└── PROJECT_GUIDE.md              # This document
```

---

## 4. How the Application Works (End-to-End Workflow)

### 4.1 Application Boot Sequence (`app.js`):
1. **`DOMContentLoaded` Event**:
   - Calls `setupEventListeners()`: Attaches form listeners, modal triggers, month navigators, and filter buttons.
   - Calls `checkAuthSession()`:
     - Checks if a valid session exists in `sessionStorage` or `localStorage`.
     - If logged out: Displays `#authOverlay` (modal for login / registration).
     - If logged in: Hides `#authOverlay`, updates user avatar in sidebar.
   - If authenticated, executes `await db.loadFromServer()`, then `loadStateFromDb()`.
   - Executes `handleRouting()`: Reads `window.location.hash` (defaulting to `#dashboard`) and renders the requested view.
   - Listens to `window.addEventListener("hashchange", handleRouting)`.

### 4.2 Data Flow Architecture:
```
[User Action in UI]
       │
       ▼
[State in app.js] ── updates ──► [Memory Cache in db.js]
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                 [localStorage Backup]     [POST /api/data to server.js]
                 (`fin_cache_<user>`)                │
                                                     ▼
                                          [data/user_<username>.json]
```

* **Reads**: Components read synchronously from `state` (hydrated by `db.get*()` from memory cache).
* **Writes**: Whenever data changes, code calls `db.save*()`. This updates the in-memory cache, writes a fallback copy to browser `localStorage`, and asynchronously transmits the entire state to Node.js backend (`POST /api/data`) to update the server's JSON file.
* **Offline / Recovery**: If the backend is temporarily unreachable, the app operates uninterrupted via `localStorage` and syncs on next connection.

### 4.3 Client-Side Hash Routing:
The app is a zero-reload Single Page Application:
* `#dashboard` ➔ `#dashboardPage` (`renderDashboard()`)
* `#transactions` ➔ `#transactionsPage` (`renderTransactions()`)
* `#budgets` ➔ `#budgetsPage` (`renderBudgets()`)
* `#accounts` ➔ `#accountsPage` (`renderAccounts()`)
* `#recurring` ➔ `#recurringPage` (`renderRecurring()`)
* `#loans` ➔ `#loansPage` (`renderLoans()`)
* `#wishlist` ➔ `#wishlistPage` (`renderWishlist()`)
* `#settings` ➔ `#settingsPage` (`renderSettings()`)

---

## 5. Core Feature Specifications & Logic

### 5.1 Monthly Category Budgets & Leftover Rollover System
* **Concept**: Envelope budgeting. Users assign a fixed monthly allowance to an expense category (e.g., $600 for *Food*, $350 for *Shopping*).
* **Monthly Refresh**: Each month (`YYYY-MM`) automatically gets a fresh start. Spending is calculated strictly from transactions belonging to that month:
  $$\text{Spent} = \sum \text{Transactions}(\text{type} = \text{'expense'} \land \text{category} = \text{Budget.category} \land \text{date starts with } YYYY-MM)$$
* **Effective Budget Calculation**:
  $$\text{Total Available} = \text{Fixed Monthly Allowance} + \text{Rollover From Previous Month (if any)}$$
  $$\text{Remaining} = \text{Total Available} - \text{Spent}$$
  $$\text{Leftover Eligible for Rollover} = \max(0, \text{Remaining})$$
* **Rollover Button**:
  - Found on every budget card with leftover funds.
  - Clicking **`Add Leftover to Next Month`** opens `#rolloverModal`.
  - The modal allows rolling over all or partial leftover funds into next month (`YYYY-(MM+1)`).
  - Stored inside `budget.rollovers[nextMonth] = rolloverAmount`.
  - Next month's envelope displays both the base fixed allowance and the extra rolled-over funds.
  - Quick Batch Action: **`Rollover All Leftovers`** in the header rolls over all eligible envelope surpluses in one click.
* **Spending Protection (Budget Cap Warning)**:
  - When creating an expense (manual or via OCR), the app checks if $\text{Expense Amount} > \text{Remaining Budget}$.
  - If exceeded, the `#budgetCapExceededModal` appears, detailing the allowed budget, already spent, remaining, and exact overrun. The user can either **Cancel** (respect their envelope cap) or **Override & Proceed**.
  - Form has a live hint (`#txBudgetHint`) showing remaining budget as the user types.

### 5.2 Transaction Management & Account Reconciliation
* Types: `income` or `expense`.
* Whenever a transaction is saved:
  - If `income`: Account balance increases by amount (`acc.balance += amount`).
  - If `expense`: Account balance decreases by amount (`acc.balance -= amount`).
* Filtering tabs on Transactions page:
  - **All**: Shows complete transaction history.
  - **Weekly**: Transactions within the last 7 calendar days.
  - **Monthly**: Transactions within the active calendar month.

### 5.3 Accounts & Cash Management
* Types: `bank` (Credit/Debit), `cash` (Physical wallet), `wallet` (Crypto/Asset).
* Deposit / Withdrawal actions: Triggers an automated balancing ledger entry under category `"Transfer"`.

### 5.4 Recurring Payments & Subscriptions
* Manages recurring liabilities (Rent, Netflix, Spotify, Utilities).
* Supports frequencies: `Monthly`, `Weekly`, `Yearly`.
* Has a **`Mark as Paid`** action that:
  1. Deducts the bill amount from the selected source account.
  2. Automatically logs an expense transaction.
  3. Increments `nextDueDate` to the next billing cycle.

### 5.5 Loans & IOUs Tracker
* `owe_me`: Receivable (someone owes the user money).
* `i_owe`: Payable (user owes someone money).
* Visual status: Flags overdue debts in bright red warning badges.
* **`Settle Loan`** button: Automatically creates compensating transaction and marks loan as settled.

### 5.6 Smart Wishlist Decision Engine
* Users add target goals with item price, store URL, and notes.
* The algorithm in `evaluateWishlistItem()` scores each item:
  * **Highly Recommended (`highly-rec`, green)**: Cost is $<5\%$ to $15\%$ of Net Worth (depending on Profile) and $<100\%$ of remaining monthly budget.
  * **Feasible (`feasible`, amber)**: Safe against Net Worth, but squeezes the current month's budget.
  * **Not Recommended (`not-rec`, red)**: Exceeds asset safety threshold or user has negative/exhausted monthly budget.
* **`Buy Now`** action: Instantly converts the wishlist item into an expense transaction, deducts funds, and removes the item from wishlist.

---

## 6. Developer Guidelines: Adding New Features

When you add a new feature or change existing behavior, follow this checklist:

### Step 1: Data Model (`js/db.js`)
1. If adding a new table/entity, add it to `cache` in `js/db.js`.
2. Add it to `resetMemoryCache()`.
3. Create getter and setter functions:
   ```javascript
   getNewEntity() {
       return cache.newEntity || [];
   },
   saveNewEntity(items) {
       cache.newEntity = items;
       syncWithServer();
   }
   ```
4. Update `initializeMockData()` if starter data is needed.
5. Update `importBackup()` to validate/import the new field.

### Step 2: HTML UI (`index.html`)
1. If adding a new view:
   - Add nav link in `<aside class="sidebar">` (`<li class="nav-item"><a href="#yourfeature">...</a></li>`).
   - Add `<section class="page-view" id="yourfeaturePage">`.
   - Ensure all interactive elements have unique IDs for robust DOM binding.
2. If adding a modal:
   - Add modal container `<div class="modal" id="yourModal">` inside the modals section at the bottom of `index.html`.
   - Include close button with `onclick="ui.closeModal('#yourModal')"`.

### Step 3: CSS & Aesthetics (`style.css`)
1. **Never use generic unstyled HTML elements**. Maintain the existing luxury aesthetics:
   - Gold/Amber primary accents: `var(--primary)`, `var(--primary-dark)`, `var(--primary-soft)`
   - Slate dark text: `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`
   - Soft backgrounds: `var(--bg-app)`, `var(--bg-card)`
   - Border radius: `var(--radius-sm)` (10px), `var(--radius-md)` (16px), `var(--radius-lg)` (24px)
   - Shadows: `var(--shadow-sm)`, `var(--shadow-md)`, `var(--shadow-glow)`
2. Add new component classes at the bottom of `style.css`.

### Step 4: Logic & Routing (`js/app.js`)
1. Add the new state variable to `const state = { ... }`.
2. Populate it inside `loadStateFromDb()`.
3. Add a route case in `renderPage()`:
   ```javascript
   case "yourfeature":
       renderYourFeature();
       break;
   ```
4. Build `renderYourFeature()`:
   - Always clear containers first (`container.innerHTML = ""`).
   - Render empty states if data array is empty.
   - Always call `ui.refreshIcons()` after injecting dynamic HTML containing Lucide icons (`<i data-lucide="..."></i>`).
5. Bind form submissions, buttons, and inputs in `setupEventListeners()`.

### Step 5: Dashboard & Alerts Integration
* Check if your new feature should present a summary card, widget, or warning banner on the main Dashboard (`renderDashboard()` and `renderDashboardAlerts()`).

---

## 7. How to Run and Test Locally

1. **Start the local server**:
   ```bash
   node server.js
   ```
   * Server runs on: `http://localhost:3000`
   * API endpoints: `/api/auth/login`, `/api/auth/register`, `/api/data` (GET/POST)
2. **Open in Browser**:
   * Windows PowerShell:
     ```powershell
     Start-Process msedge "http://localhost:3000"
     ```
3. **Default Test Accounts**:
   * Username: `alex` / Password: `password` (or `123456`)
   * Or click **"Register here"** on the login overlay to create a fresh vault.
4. **Validating Backups**:
   * Go to **Settings** ➔ Click **"Export Data Backup"** to download the full state JSON file.
   * Verify that all tables (accounts, transactions, categoryBudgets, recurring, loans, wishlist) are present in the JSON.
