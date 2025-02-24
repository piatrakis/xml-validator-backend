const express = require("express");
const multer = require("multer");
const xml2js = require("xml2js");
const cors = require("cors");
const fs = require("fs");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Configure Multer (for file uploads)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload and Process XML
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const xmlData = req.file.buffer.toString();

    // Parse XML to JSON
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

    parser.parseString(xmlData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Error parsing XML" });
        }

        res.json({ message: "File processed successfully", json: result });
    });
});

app.post("/validate", (req, res) => {
    const { jsonData, validations } = req.body;

    if (!jsonData || !validations) {
        return res.status(400).json({ error: "Invalid request data" });
    }

    let results = {};

    // Validation 1: Check if CtrlSum matches total transaction amounts
    if (validations.includes("CtrlSumCheck")) {
        results["CtrlSumCheck"] = [];

        (jsonData.Document?.CstmrCdtTrfInitn?.PmtInf || []).forEach(payment => {
            const transactions = Array.isArray(payment.CdtTrfTxInf) ? payment.CdtTrfTxInf : [payment.CdtTrfTxInf];

            const totalAmount = transactions.reduce((sum, tx) => {
                const amount = parseFloat(tx.Amt?.InstdAmt?._ || 0);
                return sum + amount;
            }, 0);

            const ctrlSum = parseFloat(payment.CtrlSum || 0);
            const isValid = ctrlSum === totalAmount;

            results["CtrlSumCheck"].push({
                PaymentID: payment.PmtInfId,
                CtrlSum: ctrlSum,
                ComputedSum: totalAmount.toFixed(2),
                Validation: isValid ? "✅ MATCH" : "❌ MISMATCH"
            });
        });
    }

    res.json(results);
});


// Start server
app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});

