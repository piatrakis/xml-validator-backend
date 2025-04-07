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
    
   
    


    // Validation 2: AlphaCtrlSumCheck (GrpHdr CtrlSum === total of all InstdAmt)
if (validations.includes("AlphaCtrlSumCheck")) {
    results["AlphaCtrlSumCheck"] = [];
  
    const grpHdr = jsonData.Document?.CstmrCdtTrfInitn?.GrpHdr;
    const payments = jsonData.Document?.CstmrCdtTrfInitn?.PmtInf;
    const paymentArray = Array.isArray(payments) ? payments : [payments];
  
    let allTxs = [];
  
    // Collect all transactions across all PmtInf
    paymentArray.forEach(payment => {
      const txs = Array.isArray(payment.CdtTrfTxInf)
        ? payment.CdtTrfTxInf
        : [payment.CdtTrfTxInf];
      allTxs = allTxs.concat(txs);
    });
  
    const totalAmount = allTxs.reduce((sum, tx) => {
      const amount = parseFloat(tx.Amt?.InstdAmt?._ || 0);
      return sum + amount;
    }, 0);
  
    const ctrlSum = parseFloat(grpHdr?.CtrlSum || 0);
    const isValid = ctrlSum === totalAmount;
  
    results["AlphaCtrlSumCheck"].push({
      CtrlSumFromGrpHdr: ctrlSum,
      ComputedSumOfInstdAmt: totalAmount.toFixed(2),
      Validation: isValid ? "✅ MATCH" : "❌ MISMATCH"
    });
  }

  if (validations.includes("AlphaFixedValueCheck")) {
    results["AlphaFixedValueCheck"] = [];
  
    const init = jsonData.Document?.CstmrCdtTrfInitn;
    const pmtInf = Array.isArray(init?.PmtInf) ? init.PmtInf[0] : init?.PmtInf;
  
    const expected = {
      "Dbtr Name": pmtInf?.Dbtr?.Nm === "EMSPI",
      "Dbtr ID": pmtInf?.Dbtr?.Id?.OrgId?.Othr?.Id === "801567852",
      "PmtMtd": pmtInf?.PmtMtd === "TRF",
      "SvcLvl Code": pmtInf?.PmtTpInf?.SvcLvl?.Cd === "SEPA",
      "CtgyPurp Code": pmtInf?.PmtTpInf?.CtgyPurp?.Cd === "EPAY",
      "IBAN": pmtInf?.DbtrAcct?.Id?.IBAN === "GR6001401010101002320023413",
      "InitgPty ID": init?.GrpHdr?.InitgPty?.Id?.OrgId?.Othr?.Id === "AMP203030",
      "InitgPty Issr": init?.GrpHdr?.InitgPty?.Id?.OrgId?.Othr?.Issr === "Alpha",
      "ChrgBr": pmtInf?.ChrgBr === "SLEV",
    };
    const fixedResults = Object.entries(expected).map(([field, passed]) => ({
        Field: field,
        Validation: passed ? "✅ OK" : "❌ MISMATCH"
      }));
    
      results["AlphaFixedValueCheck"] = fixedResults;
    }
    
    if (validations.includes("AlphaEndToEndIdCheck")) {
        results["AlphaEndToEndIdCheck"] = [];
      
        const doc = jsonData.Document?.CstmrCdtTrfInitn;
        const msgId = doc?.GrpHdr?.MsgId || "";
        const pmtInf = Array.isArray(doc?.PmtInf) ? doc.PmtInf[0] : doc?.PmtInf;
      
        const txs = Array.isArray(pmtInf?.CdtTrfTxInf)
          ? pmtInf.CdtTrfTxInf
          : [pmtInf?.CdtTrfTxInf];
      
        txs.forEach((tx, index) => {
          const orgId = tx?.Cdtr?.Id?.OrgId?.Othr?.Id || "";
          const instrId = tx?.PmtId?.InstrId || "";
          const fullMsgId = msgId;
          const msgIdTail = fullMsgId.slice(-8);
          const iban = tx?.CdtrAcct?.Id?.IBAN || "";
          const ibanTail = iban.slice(-5);
      
          const expected = `${orgId}${instrId}${msgIdTail}${ibanTail}`;
          const actual = tx?.PmtId?.EndToEndId || "";
      
          const match = actual === expected;
      
          results["AlphaEndToEndIdCheck"].push({
            Transaction: index + 1,
            Expected: expected,
            Actual: actual,
            Validation: match ? "✅ MATCH" : "❌ MISMATCH"
          });
        });
      }
      
      res.json(results); 
    });
  
    




// Start server
app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});

