const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from multiple possible locations
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "..")));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "BScode AI Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production",
  });
});

// API endpoint for AI generation
app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  // Check if API key is configured
  if (
    !process.env.BScodeAI_KEY ||
    process.env.BScodeAI_KEY === "YOUR_API_KEY_HERE"
  ) {
    return res.status(500).json({
      error:
        "API key not configured. Please set BScodeAI_KEY in environment variables.",
    });
  }

  const systemPrompt = `You are BScode AI, an expert BASIC programming assistant developed by Ayo Codes. Convert the user's request into valid classic BASIC code compatible with this interpreter.

STRICT RULES:
- Every line MUST start with a line number: 10, 20, 30, 40... (increment by 10)
- Supported keywords: PRINT, INPUT, LET, IF, THEN, ELSE, GOTO, GOSUB, RETURN, FOR, NEXT, REM, END, STOP, CLS, MOD, AND, OR, NOT
- INPUT syntax: INPUT "Prompt: "; VARIABLENAME (variable names: letters and digits only, no $ needed)
- PRINT syntax: PRINT "text"; VARIABLE (use ; to join parts, , for tab spacing)
- IF syntax: IF condition THEN statement ELSE statement (ELSE is optional)
- Conditions use: =, <>, <, >, <=, >=, AND, OR, NOT, MOD
- FOR syntax: FOR I = 1 TO N then NEXT I
- Always end program with END on the last line
- Variable names: uppercase letters and digits only (e.g. A, B1, SUM, NAME)
- Output ONLY raw BASIC code — no markdown, no backticks, no triple-backtick fences, no explanations, no preamble
- For mathematical formulas, use appropriate BASIC syntax (e.g., AREA = PI * R * R)

Example output:
10 REM Greeting program
20 INPUT "What is your name? "; N
30 PRINT "Hello, "; N
40 END`;

  try {
    const response = await fetch(process.env.BScodeAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BScodeAI_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.BScodeAI_MODEL || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate BASIC code for: ${prompt}` },
        ],
        temperature: 0.5,
        max_tokens: 1024,
      }),
    });

    if (response.status === 429) {
      return res.status(429).json({
        error: "BScode AI is busy. Please wait a moment and try again.",
      });
    }
    if (response.status === 401) {
      return res.status(401).json({
        error: "Invalid API configuration. Please check your API key.",
      });
    }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res
        .status(response.status)
        .json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || "";

    if (!generatedText) {
      return res.status(500).json({ error: "Empty response from AI" });
    }

    let cleanCode = generatedText
      .replace(/```basic\s*/gi, "")
      .replace(/```\s*/g, "")
      .replace(/^`+|`+$/g, "")
      .trim();

    // Validate and add line numbers if missing
    if (!cleanCode.match(/^\d+/m)) {
      const lines = cleanCode.split("\n");
      let lineNum = 10;
      cleanCode = lines
        .map((line) => {
          if (line.trim() && !line.match(/^\d+/)) {
            const numbered = `${lineNum} ${line}`;
            lineNum += 10;
            return numbered;
          }
          return line;
        })
        .join("\n");
    }

    res.json({ code: cleanCode });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the main HTML file - TRY MULTIPLE FILENAMES
const serveMainPage = (req, res) => {
  const possibleFiles = [
    "bsi.html",
    "index.html",
    "Bscode.html",
    "bscode.html",
  ];

  for (const file of possibleFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`Serving file: ${file}`);
      return res.sendFile(filePath);
    }
  }

  // If no file found, show a helpful message
  res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>BScode IDE</title></head>
        <body style="font-family: monospace; padding: 20px;">
            <h1>🚀 BScode BASIC IDE</h1>
            <p>Your BScode server is running!</p>
            <p>Looking for: ${possibleFiles.join(", ")}</p>
            <p>Make sure you have uploaded your HTML file to the repository.</p>
            <hr>
            <small>API endpoint: <a href="/api/health">/api/health</a></small>
        </body>
        </html>
    `);
};

// Route handlers
app.get("/", serveMainPage);
app.get("/bsi.html", serveMainPage);
app.get("/index.html", serveMainPage);

// Catch-all for other routes - serve the main page (for SPA behavior)
app.get("*", (req, res) => {
  // Don't interfere with API routes
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  serveMainPage(req, res);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 BScode Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving static files from ${__dirname}`);
  console.log(`✅ API endpoint: http://localhost:${PORT}/api/generate`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);

  // Log what files are available
  const files = fs.readdirSync(__dirname);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  console.log(`📄 HTML files found: ${htmlFiles.join(", ") || "None!"}`);
});
