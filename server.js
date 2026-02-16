const Database = require("better-sqlite3");
const db = new Database("research.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    date TEXT PRIMARY KEY,
    text TEXT NOT NULL
  );
`);

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

const http = require("http");
const fs = require("fs");
const path = require("path");

const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sessions = new Map();

const PORT = 3001;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// prevent ignoring retrieved context, hallucination outside context, inacurate citations
const ragPrompt = ChatPromptTemplate.fromMessages([
  ["system",
    "You are a research assistant. Answer only using the provided context from the user's research logs. " +
    "If the context does not contain the answer, say you are not sure and ask 1 to 2 clarifying questions. " +
    "Cite evidence by including the log date in square brackets, like [YYYY-MM-DD]."
  ],
  ["human",
    "Time window: {start} to {end}\n" +
    "Question: {input}\n\n" +
    "Context (log excerpts):\n{context}\n\n" +      // LangChain will fill {context} with retrieved chunks
    "Answer with citations:"
  ],
]);

// call LangChain helper to build the “stuff documents into the prompt and call the LLM” pipeline
// Caching the static part (LLM + prompt)
// Building the dynamic part (retrieval based on date range) per request

let ragChainPromise = null;

function getRagChain() {   // cannot build the full retrieval chain yet because retriever depends on date range
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

//-------------------------------------------------

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseLastRange(rangeStr) {
  if (typeof rangeStr !== "string") {
    return null;
  }

  const m = rangeStr.trim().toLowerCase().match(/^last\s+(\d{1,4})\s+(day|days|week|weeks|month|months|year|years)$/);
  
  if (!m) {
    return null;
  }

  const n = parseInt(m[1], 10);
  const unit = m[2];

  if (!(n >= 1 && n <= 36500)) {  // check valid
    return null;
  }

  const end = new Date();
  const start = new Date(end);

  if (unit.startsWith("day")) {   // account for days, etc.
    start.setDate(start.getDate() - n);
  } else if (unit.startsWith("week")) {
    start.setDate(start.getDate() - (7 * n));
  } else if (unit.startsWith("month")) {
    start.setMonth(start.getMonth() - n);
  } else if (unit.startsWith("year")) {
    start.setFullYear(start.getFullYear() - n);
  }

  return { start: ymd(start), end: ymd(end), n, unit };
}

function getLogsBetween(start, end) {    // SQL statement, get the two columns from the log table, oldest to newest in range
  return db.prepare(`
    SELECT date, text
    FROM logs
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(start, end);
}

//---------------------------------------------------

function getLogByDate(date) {
  return db.prepare("SELECT date, text FROM logs WHERE date = ?").get(date);
}

function getAllDates() {
  return db.prepare("SELECT date FROM logs ORDER BY date ASC").all().map(r => r.date);
}

function clip(s, max = 3000) {
  s = String(s ?? "");
  return s.length > max ? s.slice(0, max) + "\n...[truncated]" : s;
}

function readJsonBody(req, cb) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    try {
      cb(null, JSON.parse(body || "{}"));
    } catch (e) {
      cb(e);
    }
  });
}

function isValidDateYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
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


//---------------------------------------------------------------------------------


const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/ask_range") {
    readJsonBody(req, async (err, body) => {
      if (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const range = (body?.range || "").toString();
      const question = (body?.question || "").toString().trim();

      if (!question) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Expected JSON: { range: 'last 2 months', question: '...' }" }));
        return;
      }

      const parsed = parseLastRange(range);
      if (!parsed) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "range must look like: 'last 7 days' | 'last 3 weeks' | 'last 2 months' | 'last 1 year'" }));
        return;
      }

      // Step A: Pull logs in range (plain SQL)
      const rows = getLogsBetween(parsed.start, parsed.end);
      if (!rows.length) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          answer: `No logs found between ${parsed.start} and ${parsed.end}.`,
          sources: [],
          start: parsed.start,
          end: parsed.end,
        }));
        return;
      }

      try {
        // Step B: Convert logs into LangChain Documents
        const docs = rows.map(r => new Document({
          pageContent: `[${r.date}]\n${r.text}`,
          metadata: { date: r.date },
        }));

        // Step C: Split Documents into chunks (LangChain splitter)
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1200,
          chunkOverlap: 150,
        });
        const chunkedDocs = await splitter.splitDocuments(docs);

        // Step D: Put chunks into a VectorStore (LangChain handles embeddings + storage)
        // MemoryVectorStore = ephemeral (rebuild each request). Works for “last X range” nicely.
        const vectorStore = await MemoryVectorStore.fromDocuments(chunkedDocs, lcEmbeddings);

        // Step E: Create a retriever = “top-k relevant chunks”
        const retriever = vectorStore.asRetriever({ k: 8 });

        // Step F: Build RAG chain (retriever -> stuff docs -> LLM)
        const { combineDocsChain } = await getRagChain();
        const ragChain = await createRetrievalChain({
          retriever,
          combineDocsChain,
        });

        // Step G: Run it
        const out = await ragChain.invoke({
          input: question,
          start: parsed.start,
          end: parsed.end,
        });

        // out.answer is the model answer
        // out.context is usually the retrieved docs (depends on version; we handle both)
        const answer = out.answer || "(no response)";
        const usedDocs = out.context || out.sourceDocuments || [];

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          answer,
          start: parsed.start,
          end: parsed.end,
          sources: usedDocs.map(d => ({
            date: d.metadata?.date,
            snippet: clip(d.pageContent || "", 240),
          })),
        }));
      } catch (e) {
        console.error(e);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "ask_range failed" }));
      }
    });
    return;
  }

  //---------------------------------------------------------------

  if (req.method === "GET" && req.url === "/api/dates") {
    try {
      const dates = getAllDates();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dates));
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "DB query failed" }));
    }
    return;
  }

  //---------------------------------------------------------------

  if (req.method === "GET" && req.url.startsWith("/api/log")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const date = u.searchParams.get("date");

    if (!isValidDateYYYYMMDD(date)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Use ?date=YYYY-MM-DD" }));
      return;
    }

    const row = getLogByDate(date);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ 
      date, entry: row ? row.text : null 
    }));
    return;
  }

  //---------------------------------------------------------------

  if (req.method === "POST" && req.url === "/api/chat") {
    readJsonBody(req, async (err, body) => {
      if (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      const sessionId = (body?.sessionId || "default").toString();
      const message = (body?.message || "").toString().trim();

      if (!message) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Expected JSON: { sessionId, message }" }));
        return;
      }

      const history = sessions.get(sessionId) || [];
      const MAX_TURNS = 10;
      const trimmed = history.slice(-2 * MAX_TURNS);

      try {
        const resp = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: [
            { role: "system", 
              content: "You are a helpful assistant. Keep replies concise." 
            },
            ...trimmed,
            { role: "user", 
              content: message 
            },
          ],
        });

        const reply = resp.output_text || "(no response)";
        history.push({ role: "user", 
          content: message 
        });
        history.push({ role: "assistant", 
          content: reply 
        });
        sessions.set(sessionId, history);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ 
          reply 
        }));
      } catch (e) {
        console.error(e);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "OpenAI request failed" }));
      }
    });
    return;
  }

  //---------------------------------------------------------------

  if (req.method === "POST" && req.url === "/api/log") {
    readJsonBody(req, async (err, body) => {
      const date = body?.date;
      const rawText = body?.text;

      if (err || !isValidDateYYYYMMDD(date) || typeof rawText !== "string") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Expected JSON: { date:'YYYY-MM-DD', text:'...' }" }));
        return;
      }

      const text = rawText.trim();
      if (!text) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Text cannot be empty" }));
        return;
      }

      if (text.startsWith("!!!")) {
        const instruction = text.slice(3).trim() || "Explain this in simple terms.";

        const row = getLogByDate(date);
        if (!row) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: `No log found for ${date}` }));
          return;
        }

        try {
          const explanation = await explainLogWithAI({
            date: row.date,
            logText: row.text,
            instruction,
          });

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: true, date, entry: explanation, ai: true }));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "OpenAI request failed" }));
        }
        return;
      }

      //---------------------------------------------------------------

      db.prepare(`
        INSERT INTO logs (date, text) VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET text = excluded.text
      `).run(date, text);

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, date, entry: text, ai: false }));
    });
    return;
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const rawPath = req.url.split("?")[0];
  const urlPath = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(__dirname, safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));