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
      return res.status(500).json({ 
        error: "Google Sheets configuration missing. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID in environment variables." 
      });
    }

    try {
      // 1. Detect if the user pasted the whole JSON instead of just the key
      let privateKeyCandidate = GOOGLE_PRIVATE_KEY.trim();
      if (privateKeyCandidate.startsWith("{")) {
        try {
          const parsed = JSON.parse(privateKeyCandidate);
          if (parsed.private_key) {
            privateKeyCandidate = parsed.private_key;
          }
        } catch (e) {
          // Not valid JSON, continue with original string
        }
      }

      // 2. Remove any surrounding quotes
      let privateKey = privateKeyCandidate.replace(/^["'](.+)["']$/s, '$1').trim();
      
      // 3. Fix newline handling
      privateKey = privateKey.replace(/\\n/g, "\n");
      
      // 4. Validate key length (Private keys are usually > 1000 chars)
      if (privateKey.length < 100) {
        return res.status(400).json({ 
          error: "The GOOGLE_PRIVATE_KEY provided is too short. Please ensure you copied the FULL 'private_key' value from your Google JSON file, not the 'private_key_id'." 
        });
      }

      // 5. Ensure the key has proper PEM formatting headers
      if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
          // Ensure it's not already wrapped in something else
          privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }

      const auth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // --- AUTO TAB CREATION START ---
      try {
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
        const sheetNames = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];
        
        const requiredTabs = [
          { name: "Jobs", headers: ["Timestamp", "Type", "Date", "Job Number", "Customer", "Micron", "Qty", "Length", "Status"] },
          { name: "Production", headers: ["Timestamp", "Job Number", "Size", "Gross", "Core", "Net", "Meter", "Operator"] }
        ];

        for (const tab of requiredTabs) {
          if (!sheetNames.includes(tab.name)) {
            // Create the tab
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: GOOGLE_SHEET_ID,
              requestBody: {
                requests: [{
                  addSheet: { properties: { title: tab.name } }
                }]
              }
            });
            // Add headers
            await sheets.spreadsheets.values.update({
              spreadsheetId: GOOGLE_SHEET_ID,
              range: `${tab.name}!A1`,
              valueInputOption: "RAW",
              requestBody: { values: [tab.headers] }
            });
            console.log(`Created tab: ${tab.name}`);
          }
        }
      } catch (err) {
        console.warn("Auto-tab creation failed (ignoring):", err);
      }
      // --- AUTO TAB CREATION END ---
      
      let row = [];
      let range = "Sheet1!A:H";

      if (type === 'JOB_SUMMARY') {
        // Format: [Timestamp, Type, Date, Job Number, Customer, Micron, Qty, Length, Status]
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
        range = "Jobs!A:I"; // Send to a 'Jobs' tab
      } else if (type === 'PRODUCTION_ENTRY') {
        // Format: [Timestamp, Job Number, Size, Gross, Core, Net, Meter, Operator]
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
        range = "Production!A:H"; // Send to a 'Production' tab
      } else {
        return res.status(400).json({ error: "Invalid sync type" });
      }

      // We append to the sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: range,
        valueInputOption: "RAW",
        requestBody: {
          values: [row],
        },
      });

      res.json({ success: true, message: `Synchronized ${type} to Google Sheets` });
    } catch (error: any) {
      console.error("Google Sheets Sync Error:", error);
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
