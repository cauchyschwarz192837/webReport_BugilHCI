// We have HTML files.
// A server sends those HTML files to people's browsers.
// The HTML (with JS) runs in the browser.
// The browser JS sends requests back to the server.
// The server runs logic, talks to a database if needed,
// then sends data back to the browser.

// Thing	            Purpose	  Requested by
// /index.html	        Page	  Browser automatically
// /about.html	        Page	  <a href>
// /assets/main.css	Styling	  <link>
// /assets/app.js	    Code	  <script>
// /api/hello	        Data	  JavaScript (fetch)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3001;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

const DB_FILE = path.join(__dirname, "db.json");

//----------------------------------------------------------------------

// Parse into js object
function readDB(cb) {
  fs.readFile(DB_FILE, "utf8", (err, text) => {
    if (err) {
      return cb(err);
    }
    try {
      const db = JSON.parse(text);
      if (!db.logs || !Array.isArray(db.logs)) {
        db.logs = [];
      }
      cb(null, db);
    } catch (e) {
      cb(e);
    }
  });
}

function writeDB(db, cb) {
  fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8", cb);
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

const server = http.createServer((req, res) => {
  console.log(req.method, req.url);

  if (req.method === "GET" && req.url === "/api/dates") {
    readDB((err, db) => {
      if (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "DB read failed" }));
        return;
      }
      const dates = db.logs.map(x => x.date).sort();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dates));
    });
    return;
  }


  if (req.method === "GET" && req.url.startsWith("/api/log")) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const date = u.searchParams.get("date");

    if (!isValidDateYYYYMMDD(date)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Use ?date=YYYY-MM-DD" }));
      return;
    }

    readDB((err, db) => {
      if (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "DB read failed" }));
        return;
      }

      const entry = db.logs.find((x) => x.date === date) || null;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ date, entry })); // slightly nicer shape
    });
    return;
  }


  if (req.method === "POST" && req.url === "/api/log") {
    readJsonBody(req, (err, body) => {
      const date = body?.date;
      const text = body?.text;

      if (err || !isValidDateYYYYMMDD(date) || typeof text !== "string" || text.trim() === "") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Expected JSON: { date:'YYYY-MM-DD', text:'...' }" }));
        return;
      }

      readDB((err2, db) => {
        if (err2) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "DB read failed" }));
          return;
        }

        const entry = { date, text: text.trim() };
        const i = db.logs.findIndex((x) => x.date === date);
        if (i >= 0) db.logs[i] = entry;
        else db.logs.push(entry);

        writeDB(db, (err3) => {
          if (err3) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "DB write failed" }));
            return;
          }

          res.statusCode = 201;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(entry));
        });
      });
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


server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
