const path = require("path");
const fs = require("fs");

const express = require("express");
const app = express();

app.use(express.json({ limit: "2mb" }));

app.use(express.static(__dirname));

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/images", express.static(path.join(__dirname, "images")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const Database = require("better-sqlite3");
const db = new Database(process.env.DB_PATH || path.join(__dirname, "research.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    date TEXT PRIMARY KEY,
    text TEXT NOT NULL
  );
`);

function isValidDateYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function getLogByDate(date) {
  return db.prepare("SELECT date, text FROM logs WHERE date = ?").get(date);
}

function getAllDates() {
  return db.prepare("SELECT date FROM logs ORDER BY date ASC").all().map(r => r.date);
}

function getLogsBetween(start, end) {
  return db.prepare(`
    SELECT date, text
    FROM logs
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(start, end);
}

function clip(s, max = 3000) {
  s = String(s ?? "");
  return s.length > max ? s.slice(0, max) + "\n...[truncated]" : s;
}

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { MemoryVectorStore } = require("@langchain/classic/vectorstores/memory");
const { Document } = require("@langchain/core/documents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { createStuffDocumentsChain } = require("@langchain/classic/chains/combine_documents");
const { createRetrievalChain } = require("@langchain/classic/chains/retrieval");

const lcEmbeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY,
});

const lcLLM = new ChatOpenAI({
  model: "gpt-4.1-mini",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
});

const ragPrompt = ChatPromptTemplate.fromMessages([
  ["system",
    "You are a research assistant. Answer only using the provided context from the user's research logs. " +
    "If the context does not contain the answer, say you are not sure and ask 1 to 2 clarifying questions. " +
    "Cite evidence by including the log date in square brackets, like [YYYY-MM-DD]."
  ],
  ["human",
    "Time window: {start} to {end}\n" +
    "Question: {input}\n\n" +
    "Context (log excerpts):\n{context}\n\n" +
    "Answer with citations:"
  ],
]);

let ragChainPromise = null;
function getRagChain() {
  if (!ragChainPromise) {
    ragChainPromise = (async () => {
      const combineDocsChain = await createStuffDocumentsChain({
        llm: lcLLM,
        prompt: ragPrompt,
      });
      return { combineDocsChain };
    })();
  }
  return ragChainPromise;
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLastRange(rangeStr) {
  if (typeof rangeStr !== "string") return null;

  const m = rangeStr.trim().toLowerCase()
    .match(/^last\s+(\d{1,4})\s+(day|days|week|weeks|month|months|year|years)$/);
  if (!m) return null;

  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (!(n >= 1 && n <= 36500)) return null;

  const end = new Date();
  const start = new Date(end);

  if (unit.startsWith("day")) start.setDate(start.getDate() - n);
  else if (unit.startsWith("week")) start.setDate(start.getDate() - 7 * n);
  else if (unit.startsWith("month")) start.setMonth(start.getMonth() - n);
  else if (unit.startsWith("year")) start.setFullYear(start.getFullYear() - n);

  return { start: ymd(start), end: ymd(end), n, unit };
}

async function explainLogWithAI({ date, logText, instruction }) {
  const system = [
    "You are an assistant that explains biology research log entries clearly and accurately.",
    "Explain in simple terms first, then add a short step-by-step breakdown.",
    "Define jargon briefly. End with 2 to 3 key takeaways.",
    "If the log is ambiguous, say you are unsure, then list 2 to 3 clarifying questions.",
  ].join(" ");

  const userPrompt =
    `Research log entry:\n` +
    `Date: ${date}\n` +
    `Log: ${clip(logText, 3500)}\n\n` +
    `User request: ${instruction || "Explain this in simple terms."}`;

  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
  });

  return resp.output_text || "(no response)";
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/dates", (req, res) => {
  try {
    res.json(getAllDates());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed" });
  }
});

app.get("/api/log", (req, res) => {
  try {
    const date = req.query.date;
    if (!isValidDateYYYYMMDD(date)) {
      return res.status(400).json({ error: "Use ?date=YYYY-MM-DD" });
    }
    const row = getLogByDate(date);
    res.json({ date, entry: row ? row.text : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB query failed" });
  }
});

app.post("/api/log", async (req, res) => {
  try {
    const date = req.body?.date;
    const rawText = req.body?.text;

    if (!isValidDateYYYYMMDD(date) || typeof rawText !== "string") {
      return res.status(400).json({ error: "Expected JSON: { date:'YYYY-MM-DD', text:'...' }" });
    }

    const text = rawText.trim();
    if (!text) {
      return res.status(400).json({ error: "Text cannot be empty" });
    }

    // "!!!" = explain the EXISTING log entry for that date
    if (text.startsWith("!!!")) {
      const instruction = text.slice(3).trim() || "Explain this in simple terms.";
      const row = getLogByDate(date);
      if (!row) {
        return res.status(404).json({ error: `No log found for ${date}` });
      }
      const explanation = await explainLogWithAI({
        date: row.date,
        logText: row.text,
        instruction,
      });
      return res.json({ ok: true, date, entry: explanation, ai: true });
    }

    db.prepare(`
      INSERT INTO logs (date, text) VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET text = excluded.text
    `).run(date, text);

    return res.status(201).json({ ok: true, date, entry: text, ai: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "log failed" });
  }
});

app.post("/api/ask_range", async (req, res) => {
  try {
    const range = (req.body?.range || "").toString();
    const question = (req.body?.question || "").toString().trim();

    if (!question) {
      return res.status(400).json({ error: "Expected JSON: { range: 'last 2 months', question: '...' }" });
    }

    const parsed = parseLastRange(range);
    if (!parsed) {
      return res.status(400).json({ error: "range must look like: 'last 7 days' | 'last 3 weeks' | 'last 2 months' | 'last 1 year'" });
    }

    const rows = getLogsBetween(parsed.start, parsed.end);
    if (!rows.length) {
      return res.json({
        answer: `No logs found between ${parsed.start} and ${parsed.end}.`,
        sources: [],
        start: parsed.start,
        end: parsed.end,
      });
    }

    const docs = rows.map(r => new Document({
      pageContent: `[${r.date}]\n${r.text}`,
      metadata: { date: r.date },
    }));

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 150,
    });
    const chunkedDocs = await splitter.splitDocuments(docs);

    const vectorStore = await MemoryVectorStore.fromDocuments(chunkedDocs, lcEmbeddings);
    const retriever = vectorStore.asRetriever({ k: 8 });

    const { combineDocsChain } = await getRagChain();
    const ragChain = await createRetrievalChain({ retriever, combineDocsChain });

    const out = await ragChain.invoke({
      input: question,
      start: parsed.start,
      end: parsed.end,
    });

    const answer = out.answer || "(no response)";
    const usedDocs = out.context || out.sourceDocuments || [];

    res.json({
      answer,
      start: parsed.start,
      end: parsed.end,
      sources: usedDocs.map(d => ({
        date: d.metadata?.date,
        snippet: clip(d.pageContent || "", 240),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ask_range failed" });
  }
});

const sessions = new Map();
app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = (req.body?.sessionId || "default").toString();
    const message = (req.body?.message || "").toString().trim();

    if (!message) {
      return res.status(400).json({ error: "Expected JSON: { sessionId, message }" });
    }

    const history = sessions.get(sessionId) || [];
    const MAX_TURNS = 10;
    const trimmed = history.slice(-2 * MAX_TURNS);

    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: "You are a helpful assistant. Keep replies concise." },
        ...trimmed,
        { role: "user", content: message },
      ],
    });

    const reply = resp.output_text || "(no response)";
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    sessions.set(sessionId, history);

    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "OpenAI request failed" });
  }
});

app.use((req, res) => {
  console.log("404:", req.method, req.url);
  res.status(404).send("Not found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});