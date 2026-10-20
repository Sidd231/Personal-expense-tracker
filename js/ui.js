// UI Formatters and Helper Functions
export const ui = {
    // Format currency to USD format
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    },

    // Format date string to readable format (e.g., Aug 6, 2026)
    formatDate(dateStr) {
        if (!dateStr) return "";
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    // Category icon names for Lucide icons
    categoryIcons: {
        "Salary": "trending-up",
        "Food": "utensils",
        "Shopping": "shopping-bag",
        "Rent": "home",
        "Transport": "car",
        "Entertainment": "tv",
        "Utilities": "zap",
        "Transfer": "arrow-left-right",
        "Investment": "banknote",
        "Other": "help-circle"
    },

    // Category background and text color styling mapping
    categoryClasses: {
        "Salary": "badge-income",
        "Food": "badge-warning",
        "Shopping": "badge-expense",
        "Rent": "badge-danger",
        "Transport": "badge-danger",
        "Entertainment": "badge-recurring",
        "Utilities": "badge-recurring",
        "Transfer": "badge-warning",
        "Investment": "badge-income",
        "Other": "badge-warning"
    },

    // Helper to render lucide icon html structure
    getIconHtml(category, type = "expense") {
        const iconName = this.categoryIcons[category] || (type === "income" ? "trending-up" : "shopping-bag");
        const classType = type === "income" ? "income" : "expense";
        return `<div class="transaction-icon-box ${classType}"><i data-lucide="${iconName}"></i></div>`;
    },

    // Opens a modal by selector
    openModal(selector) {
        const modal = document.querySelector(selector);
        if (modal) {
            modal.classList.add("active");
        }
    },

    // Closes a modal by selector
    closeModal(selector) {
        const modal = document.querySelector(selector);
        if (modal) {
            modal.classList.remove("active");
            // Clear inputs inside modal
            const form = modal.querySelector("form");
            if (form) form.reset();
        }
    },

    // Refreshes Lucide Icons on dynamic DOM injection
    refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
};
