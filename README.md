# AuraFinance — Personal Wealth & Money Tracker

AuraFinance is a modern personal finance tracking, envelope budgeting, and wealth management Single Page Application (SPA).

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Start the server**:
   ```bash
   npm start
   ```
3. **Open the application**:
   Open [http://localhost:3000](http://localhost:3000) in Microsoft Edge, Chrome, or any modern web browser.

---

## 🔑 Demo Login Credentials

The project comes pre-configured with demo accounts containing sample financial records (accounts, transactions, recurring bills, category budgets, loans, and wishlists):

| Username (ID) | Password | Notes / Profile |
| :--- | :--- | :--- |
| `alex` | `123456` | Complete demo profile (Bank checking, cash wallet, crypto ledger, transactions) |
| `sidd` | `123456` | Full financial data set with custom loans, bills, and rollover envelopes |
| `user_a` | `123456` | Minimal demo account with checking account & active subscriptions |

> **Note**: You can also create a new personal wallet vault by clicking **"Register here"** on the login screen. All passwords are SHA-256 hashed on the client and double-hashed with salt on the server.

---

## 📖 Complete Documentation & Developer Guide

Before working on any feature, read the comprehensive developer documentation:

👉 **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)**

It covers:
* Full project architecture & technology stack
* Directory structure and file breakdowns
* End-to-end data flow (memory cache, `localStorage`, server sync)
* Detailed breakdown of all features (Budgets with Leftover Rollovers, Transactions, Accounts, Recurring, Loans, Wishlist Engine, OCR Scanner)
* Step-by-step developer checklist for adding new features
* Security, hashing, and database persistence details
