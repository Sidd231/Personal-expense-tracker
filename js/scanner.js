import { ui } from "./ui.js";

// Mock receipts library with slight randomization for realism
const MOCK_RECEIPTS = [
    { merchant: "Target Store", category: "Shopping", baseAmount: 58.40 },
    { merchant: "Whole Foods Market", category: "Food", baseAmount: 72.15 },
    { merchant: "Shell Oil Co.", category: "Transport", baseAmount: 48.00 },
    { merchant: "Olive Garden Dining", category: "Food", baseAmount: 84.50 },
    { merchant: "Apple Store Online", category: "Shopping", baseAmount: 149.00 },
    { merchant: "Best Buy Tech", category: "Shopping", baseAmount: 220.00 },
    { merchant: "Uber Rides", category: "Transport", baseAmount: 22.40 },
    { merchant: "Starbucks Coffee", category: "Food", baseAmount: 12.80 }
];

export const scanner = {
    isScanning: false,

    // Triggers scanning simulation
    initiateScan(file, onScanComplete) {
        if (this.isScanning) return;
        this.isScanning = true;

        const reader = new FileReader();
        reader.onload = (e) => {
            // Update preview image
            const imgPreview = document.getElementById("scannerPreviewImg");
            imgPreview.src = e.target.result;
            
            // Show scanning states
            document.getElementById("scannerPlaceholder").style.display = "none";
            document.getElementById("scannerPreviewContainer").style.display = "block";
            document.getElementById("scannerOverlay").style.display = "flex";
            document.getElementById("scannerLaser").style.display = "block";

            const statusText = document.getElementById("scannerStatus");
            
            // Cycle status messages to simulate AI processing
            setTimeout(() => {
                statusText.innerText = "Claude AI: Parsing OCR layout...";
            }, 800);

            setTimeout(() => {
                statusText.innerText = "Claude AI: Extracting amount and items...";
            }, 1600);

            setTimeout(() => {
                statusText.innerText = "Claude AI: Categorizing merchant...";
            }, 2400);

            // Complete scan after 3.2 seconds
            setTimeout(() => {
                this.isScanning = false;
                
                // Hide overlay
                document.getElementById("scannerOverlay").style.display = "none";
                document.getElementById("scannerLaser").style.display = "none";

                // Generate random mock OCR extraction
                const template = MOCK_RECEIPTS[Math.floor(Math.random() * MOCK_RECEIPTS.length)];
                
                // Introduce slight random variance to the price (-$5 to +$15)
                const variance = (Math.random() * 20) - 5;
                const finalAmount = Math.max(5.50, parseFloat((template.baseAmount + variance).toFixed(2)));
                
                const extraction = {
                    amount: finalAmount,
                    description: template.merchant,
                    category: template.category,
                    date: new Date().toISOString().split("T")[0]
                };

                if (onScanComplete) {
                    onScanComplete(extraction);
                }
            }, 3200);
        };
        reader.readAsDataURL(file);
    },

    // Reset scanner UI to upload state
    reset() {
        this.isScanning = false;
        document.getElementById("scannerPlaceholder").style.display = "flex";
        document.getElementById("scannerPreviewContainer").style.display = "none";
        document.getElementById("scannerOverlay").style.display = "none";
        document.getElementById("scannerLaser").style.display = "none";
        document.getElementById("scannerPreviewImg").src = "";
        document.getElementById("scannerStatus").innerText = "Claude AI: Analyzing receipt image...";
        
        // Reset file inputs
        const fileInput = document.getElementById("receiptFileInput");
        if (fileInput) fileInput.value = "";
    }
};
