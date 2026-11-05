// Wordly Usage Dashboard: live data from BigQuery
// Serves the dashboard and three API routes that query the sessions_clean view.
// In Cloud Shell, it runs with your own Google login, so no keys are needed.

const express = require("express");
const compression = require("compression");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { BigQuery } = require("@google-cloud/bigquery");

const PROJECT = process.env.BQ_PROJECT || "support-467322";
const VIEW = process.env.BQ_VIEW || "support-467322.wordly_session_data_central.sessions_clean";
const ACCOUNTS = process.env.BQ_ACCOUNTS || "support-467322.wordly_usage_data.usage_with_account_name";
const MAX_ROWS = Number(process.env.MAX_ROWS || 100000);
const PORT = process.env.PORT || 8080;

const bq = new BigQuery({ projectId: PROJECT });
const app = express();
app.use(compression());
app.use(express.json({ limit: "5mb" }));
// Serves ./public if present (Cloud Shell zip), otherwise the dashboard source in ../src (GitHub repo)
const STATIC_DIR = fs.existsSync(path.join(__dirname, "public")) ? path.join(__dirname, "public") : path.join(__dirname, "..", "src");
app.use(express.static(STATIC_DIR));

// BigQuery column -> the header the dashboard expects (same as the Usage report)
const BASE_COLUMNS = [
  ["session_id", "Session ID"],
  ["COALESCE(title, session_name)", "Title"],
  ["date", "Date"],
  ["time", "Time"],
  ["timezone", "Timezone"],
  ["COALESCE(real_duration, duration)", "Real Duration"],
  ["COALESCE(minutes_billed, usage_min, minutes)", "Minutes Billed"],
  ["COALESCE(email, email_address)", "Email"],
  ["pool_of_minutes", "Pool of Minutes"],
  ["account_name", "Account Name"],
  ["label", "Label"],
  ["connection", "Connection"],
  ["presenters", "Presenters"],
  ["attendees", "Attendees"]
];
const LANGUAGE_COLUMNS = {
  english_us: "English (US)", english_uk: "English (UK)", english_au: "English (AU)",
  spanish_latam: "Spanish (LatAm)", spanish_es: "Spanish (ES)",
  portuguese_br: "Portuguese (BR)", portuguese_pt: "Portuguese (PT)",
  french_fr: "French (FR)", french_ca: "French (CA)",
  chinese_simplified: "Chinese (Simplified)", chinese_traditional: "Chinese (Traditional)",
  haitian_creole: "Haitian Creole",
  japanese: 0, korean: 0, german: 0, thai: 0, vietnamese: 0, italian: 0, dutch: 0, cantonese: 0,
  swedish: 0, ukrainian: 0, danish: 0, hindi: 0, arabic: 0, norwegian: 0, russian: 0, finnish: 0,
  indonesian: 0, romanian: 0, slovak: 0, greek: 0, hungarian: 0, turkish: 0, urdu: 0, bengali: 0,
  croatian: 0, malay: 0, tagalog: 0, afrikaans: 0, bosnian: 0, gujarati: 0, hebrew: 0, slovenian: 0,
  czech: 0, kannada: 0, polish: 0, serbian: 0, albanian: 0, georgian: 0, icelandic: 0, swahili: 0,
  zulu: 0, bulgarian: 0, estonian: 0, lithuanian: 0, tamil: 0, irish: 0, maltese: 0, persian: 0,
  latvian: 0, catalan: 0, welsh: 0, lao: 0, punjabi: 0, armenian: 0, macedonian: 0
};
const titleCase = s => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const LANGS = Object.entries(LANGUAGE_COLUMNS).map(([col, name]) => [col, name || titleCase(col)]);
const COLUMNS = [...BASE_COLUMNS, ...LANGS];

const EMAIL_DOMAIN = "LOWER(REGEXP_EXTRACT(COALESCE(email, email_address), r'@([^@\\s>]+)'))";
const SESSION_DATE = "COALESCE(SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(date, 1, 10)), SAFE.PARSE_DATE('%m/%d/%Y', date), SAFE.PARSE_DATE('%m/%d/%y', date))";

// Saved customers, event groups and removed sessions live in a file in your home folder,
// outside the project folder, so they survive Cloud Shell restarts and re-uploads of the project.
const STORE_FILE = process.env.STORE_FILE || path.join(os.homedir(), "wordly-dashboard-data.json");
const readStore = () => { try { return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")); } catch { return {}; } };
app.get("/api/store", (req, res) => res.json(readStore()));
app.put("/api/store", (req, res) => {
  const { key, value } = req.body || {};
  if (typeof key !== "string" || !key.startsWith("wordly-")) return res.status(400).json({ error: "Invalid key" });
  const data = readStore();
  if (value == null) delete data[key]; else data[key] = String(value);
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 1));
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true, source: "bigquery", view: VIEW }));

// Search domains, accounts and pools by text
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return res.json({ results: [] });
  const query = `
    WITH base AS (
      SELECT ${EMAIL_DOMAIN} AS domain, account_name, wordly_account_id, pool_of_minutes
      FROM \`${VIEW}\`
    )
    SELECT * FROM (
      SELECT 'domain' AS kind, domain AS value, domain AS label, COUNT(*) AS sessions
      FROM base WHERE domain LIKE @q GROUP BY 2
      UNION ALL
      SELECT 'account', wordly_account_id, ANY_VALUE(account_name), COUNT(*)
      FROM base WHERE wordly_account_id IS NOT NULL AND (LOWER(account_name) LIKE @q OR LOWER(wordly_account_id) = @exact)
      GROUP BY 2
      UNION ALL
      SELECT 'pool', pool_of_minutes, pool_of_minutes, COUNT(*)
      FROM base WHERE LOWER(pool_of_minutes) LIKE @q GROUP BY 2
    )
    ORDER BY sessions DESC
    LIMIT 40`;
  const companyQuery = `
    SELECT 'company' AS kind, Company_ID AS value, ANY_VALUE(hs_company_name) AS label, COUNT(*) AS accounts
    FROM \`${ACCOUNTS}\`
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM \`${ACCOUNTS}\`)
      AND Company_ID IS NOT NULL AND LOWER(hs_company_name) LIKE @q
    GROUP BY 2
    ORDER BY accounts DESC
    LIMIT 15`;
  try {
    const serviceQuery = `
      SELECT 'service' AS kind, Service AS value, Service AS label, COUNT(*) AS accounts
      FROM \`${ACCOUNTS}\`
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM \`${ACCOUNTS}\`)
        AND Service IS NOT NULL AND Service NOT IN ('Active', 'Restricted')
        AND LOWER(Service) LIKE @q
      GROUP BY Service
      ORDER BY accounts DESC
      LIMIT 10`;
    const [[rows], companies, services] = await Promise.all([
      bq.query({ query, params: { q: `%${q}%`, exact: q } }),
      bq.query({ query: companyQuery, params: { q: `%${q}%` } }).then(r => r[0]).catch(e => { console.error("Company search:", e.message); return []; }),
      bq.query({ query: serviceQuery, params: { q: `%${q}%` } }).then(r => r[0]).catch(e => { console.error("Workspace search:", e.message); return []; })
    ]);
    res.json({ results: [
      ...services.map(r => ({ ...r, accounts: Number(r.accounts) })),
      ...companies.map(r => ({ ...r, accounts: Number(r.accounts) })),
      ...rows.map(r => ({ ...r, sessions: Number(r.sessions) }))
    ] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// All sessions for the selected domains, accounts and pools within the date range
app.post("/api/sessions", async (req, res) => {
  const list = v => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 200) : []);
  const domains = list(req.body.domains).map(d => d.toLowerCase());
  const accounts = list(req.body.accounts);
  const pools = list(req.body.pools);
  const companies = list(req.body.companies);
  const services = list(req.body.services);
  if (!domains.length && !accounts.length && !pools.length && !companies.length && !services.length) return res.status(400).json({ error: "Nothing selected" });
  const LATEST = `(SELECT MAX(snapshot_date) FROM \`${ACCOUNTS}\`)`;
  const query = `
    SELECT ${COLUMNS.map(([expr], i) => `${expr} AS c${i}`).join(",\n           ")}
    FROM \`${VIEW}\`
    WHERE (${EMAIL_DOMAIN} IN UNNEST(@domains)
           OR wordly_account_id IN UNNEST(@accounts)
           OR pool_of_minutes IN UNNEST(@pools)
           OR LOWER(COALESCE(email, email_address)) IN (
                SELECT LOWER(Owner_Email) FROM \`${ACCOUNTS}\`
                WHERE snapshot_date = ${LATEST} AND Company_ID IN UNNEST(@companies))
           -- Workspace: sessions in one of its accounts, or run by one of its owners
           -- from a pool that isn't one of that owner's accounts outside the workspace
           OR pool_of_minutes IN (
                SELECT portal_account_name FROM \`${ACCOUNTS}\`
                WHERE snapshot_date = ${LATEST} AND Service IN UNNEST(@services))
           OR (LOWER(COALESCE(email, email_address)) IN (
                 SELECT LOWER(Owner_Email) FROM \`${ACCOUNTS}\`
                 WHERE snapshot_date = ${LATEST} AND Service IN UNNEST(@services))
               AND IFNULL(pool_of_minutes, '') NOT IN (
                 SELECT o.portal_account_name FROM \`${ACCOUNTS}\` o
                 WHERE o.snapshot_date = ${LATEST} AND o.portal_account_name IS NOT NULL
                   AND IFNULL(o.Service, '') NOT IN UNNEST(@services)
                   AND LOWER(o.Owner_Email) IN (
                     SELECT LOWER(Owner_Email) FROM \`${ACCOUNTS}\`
                     WHERE snapshot_date = ${LATEST} AND Service IN UNNEST(@services)))))
      AND (@from = '' OR ${SESSION_DATE} >= SAFE.PARSE_DATE('%Y-%m-%d', @from))
      AND (@to = '' OR ${SESSION_DATE} <= SAFE.PARSE_DATE('%Y-%m-%d', @to))
    LIMIT ${MAX_ROWS + 1}`;
  // Latest balance snapshot for the same selection
  const accountsQuery = `
    SELECT portal_account_name, Owner_Name, Owner_Email, hs_company_name, Company_ID, Service,
           Allow_Overage, Consumed_Mins, Available_Mins, Consumed_Last_7_Days, Consumed_Last_30_Days,
           Date_Created, Last_Used, hs_csm, hs_account_owner, CAST(snapshot_date AS STRING) AS snapshot_date
    FROM \`${ACCOUNTS}\`
    WHERE snapshot_date = ${LATEST}
      AND (Company_ID IN UNNEST(@companies)
           OR Service IN UNNEST(@services)
           OR LOWER(REGEXP_EXTRACT(Owner_Email, r'@([^@\\s>]+)')) IN UNNEST(@domains)
           OR REGEXP_EXTRACT(portal_account_name, r'\\(([0-9a-f]{5})\\)\\s*$') IN UNNEST(@accounts)
           OR portal_account_name IN UNNEST(@pools))`;
  const types = { domains: ["STRING"], accounts: ["STRING"], pools: ["STRING"], companies: ["STRING"], services: ["STRING"] };
  try {
    const [[rows], acctRows] = await Promise.all([
      bq.query({
        query,
        params: { domains, accounts, pools, companies, services, from: String(req.body.from || ""), to: String(req.body.to || "") },
        types: { ...types, from: "STRING", to: "STRING" }
      }),
      bq.query({ query: accountsQuery, params: { domains, accounts, pools, companies, services }, types })
        .then(r => r[0]).catch(e => { console.error("Accounts query:", e.message); return null; })
    ]);
    const truncated = rows.length > MAX_ROWS;
    res.json({
      header: COLUMNS.map(([, name]) => name),
      rows: rows.slice(0, MAX_ROWS).map(r => COLUMNS.map((_, i) => r["c" + i] ?? null)),
      truncated,
      accounts: acctRows ? acctRows.map(a => ({
        ...a,
        Consumed_Mins: Number(a.Consumed_Mins ?? 0), Available_Mins: Number(a.Available_Mins ?? 0),
        Consumed_Last_7_Days: Number(a.Consumed_Last_7_Days ?? 0), Consumed_Last_30_Days: Number(a.Consumed_Last_30_Days ?? 0)
      })) : null
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Wordly dashboard running on port ${PORT}. In Cloud Shell, use Web Preview > Preview on port ${PORT}.`));
