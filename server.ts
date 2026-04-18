import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API Route: Sync to Google Sheets
  app.post("/api/sync-to-sheets", async (req, res) => {
    const { data, type } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Missing sync data" });
    }

    const {
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_PRIVATE_KEY,
      GOOGLE_SHEET_ID
    } = process.env;

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      console.error("Sync Error: Missing environment variables");
      return res.status(500).json({ 
        error: "Google Sheets configuration missing. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID in environment variables." 
      });
    }

    try {
      // 0. Extract Sheet ID if user pasted a URL
      let sheetId = GOOGLE_SHEET_ID.trim();
      if (sheetId.includes("docs.google.com/spreadsheets/d/")) {
        const matches = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (matches && matches[1]) {
          sheetId = matches[1];
        }
      }

      // 1. Detect if the user pasted the whole JSON instead of just the key
      let privateKeyCandidate = GOOGLE_PRIVATE_KEY.trim();
      if (privateKeyCandidate.startsWith("{")) {
        try {
          const parsed = JSON.parse(privateKeyCandidate);
          if (parsed.private_key) {
            privateKeyCandidate = parsed.private_key;
          }
        } catch (e) {
          // Not valid JSON
        }
      }

      // 2. Remove any surrounding quotes
      let privateKey = privateKeyCandidate.replace(/^["'](.+)["']$/s, '$1').trim();
      
      // 3. Fix newline handling
      privateKey = privateKey.replace(/\\n/g, "\n");
      
      // 4. Validate key length
      if (privateKey.length < 100) {
        return res.status(400).json({ 
          error: "The GOOGLE_PRIVATE_KEY is too short. Ensure you copied the FULL 'private_key' value from the JSON file." 
        });
      }

      // 5. Ensure headers
      if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
          privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }

      console.log(`Syncing data for ${GOOGLE_SERVICE_ACCOUNT_EMAIL} to sheet ${sheetId}...`);

      const auth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });
      
      let row = [];
      let range = "";

      if (type === 'JOB_SUMMARY') {
        row = [
          new Date().toISOString(),
          "JOB_UPDATE",
          data.date,
          data.jobNumber,
          data.customerName || 'N/A',
          data.micron,
          data.totalQuantity,
          data.totalLength,
          data.status
        ];
        range = "Jobs!A:I";
      } else if (type === 'PRODUCTION_ENTRY') {
        row = [
          new Date().toISOString(),
          data.jobNumber || data.jobId,
          data.coilSize,
          data.grossWeight,
          data.coreWeight,
          data.netWeight,
          data.meter,
          data.operatorUid || 'Operator'
        ];
        range = "Production!A:H";
      } else if (type === 'PRODUCTION_BATCH') {
        const entries = Array.isArray(data) ? data : [data];
        const rows = entries.map((entry: any) => [
          new Date().toISOString(),
          entry.jobNumber || entry.jobId,
          entry.coilSize,
          entry.grossWeight,
          entry.coreWeight,
          entry.netWeight,
          entry.meter,
          entry.operatorUid || 'Operator'
        ]);
        
        await appendWithRetry("Production!A:H", rows, true);
        console.log(`Sync Successful: ${type} (${entries.length} rows)`);
        return res.json({ success: true, message: `Synchronized ${entries.length} entries to Google Sheets` });
      }

      // Helper function to append or create-then-append
      async function appendWithRetry(targetRange: string, values: any[], isBatch = false) {
        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: targetRange,
            valueInputOption: "RAW",
            requestBody: { values: isBatch ? values : [values] },
          });
        } catch (error: any) {
          // If tab doesn't exist, create it and retry
          if (error.message?.includes("range") || error.message?.includes("not find sheet")) {
            console.log("Tab missing, creating it...");
            const tabName = targetRange.split("!")[0];
            const headers = (type === 'PRODUCTION_ENTRY' || type === 'PRODUCTION_BATCH')
              ? ["Timestamp", "Job Number", "Size", "Gross", "Core", "Net", "Meter", "Operator"]
              : ["Timestamp", "Type", "Date", "Job Number", "Customer", "Micron", "Qty", "Length", "Status"];
            
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: sheetId,
              requestBody: {
                requests: [{ addSheet: { properties: { title: tabName } } }]
              }
            });
            
            // Add headers
            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: `${tabName}!A1`,
              valueInputOption: "RAW",
              requestBody: { values: [headers] }
            });

            // Try append again
            await sheets.spreadsheets.values.append({
              spreadsheetId: sheetId,
              range: targetRange,
              valueInputOption: "RAW",
              requestBody: { values: isBatch ? values : [values] },
            });
          } else {
            throw error;
          }
        }
      }

      if (type !== 'PRODUCTION_BATCH') {
        await appendWithRetry(range, row);
        console.log(`Sync Successful: ${type}`);
        res.json({ success: true, message: `Synchronized ${type} to Google Sheets` });
      }
    } catch (error: any) {
      console.error("Google Sheets Sync Error:", error.message);
      res.status(500).json({ error: error.message || "Failed to sync to Google Sheets" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
