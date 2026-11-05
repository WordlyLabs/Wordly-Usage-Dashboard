# Wordly Usage Dashboard

Turns the Usage and Admin Transaction reports from the Wordly portal into an interactive dashboard:
minutes, sessions, attendees, languages, account balances, event timelines, and saved, time-stamped versions.

Everything runs in the browser. Report files are read locally and never uploaded.

## Two ways it's used

| | Who | How |
|---|---|---|
| **Customer file** | Customers and CSMs | `dist/Wordly Usage Dashboard.html`: a single file you double-click to open. Libraries are built in, so it works offline. |
| **BigQuery prototype** | Internal, on hold | `bigquery-prototype/`: a small Node server that adds live customer search against BigQuery. See its README for status and known data issues. |

## Repository layout

```
src/index.html                     The dashboard source (one self-contained page; libraries load from cdnjs)
scripts/build-customer.js          Builds the customer file with libraries inlined
dist/Wordly Usage Dashboard.html   The customer file (built; commit it with each release)
docs/customer-guide.md             Getting-started guide for customers
bigquery-prototype/                Node + Express server for live BigQuery data (internal)
```

## Working on it

1. Edit `src/index.html`.
2. Test by opening it in Chrome or Edge (double-click it, or drag it into a browser tab). Use your own test reports; don't commit them.
3. Build the customer file:
   ```
   npm install
   npm run build
   ```
4. Commit both `src/index.html` and `dist/Wordly Usage Dashboard.html`.

Requirements: Node 18 or newer for the build. No other tooling.

### Where things are in `src/index.html`

The page is plain HTML, CSS and JavaScript (no framework). The script is organized in labeled sections:

| Section | Key functions | What it does |
|---|---|---|
| Parsing | `findHeader`, `parseUsage`, `parseTransactions` | Detects report type from column headers; reads rows. Handles duplicate "Time" columns and text dates. |
| Joining | `dedupeUsage`, `joinReports`, `buildData` | Removes duplicate session copies (same ID and real start time across time zones); matches usage rows to transaction debits by session ID and end time (±1 min). |
| Filters | `activeRows`, `filterBar` | Date/time range, workspace, event group, removed sessions. |
| Tabs | `renderOverview`, `renderAccounts`, `renderEvents`, `renderSessions`, `renderTimeline` | One renderer per tab; charts use Chart.js. |
| Time zones | `convertData`, `zoneOffset` | Converts all times from the report's zone to the chosen one. |
| Saved versions | `vault`, `openSaveDialog`, `renderLibrary`, `importBackup` | Time-stamped versions in IndexedDB (per browser); JSON backups. |
| Exports | `buildExportHtml`, `downloadFile` | Standalone read-only page with the data embedded. |
| Live data | `detectApi`, `loadCustomer` | Only active when served by `bigquery-prototype/server.js`. |
| Claude preview | `createShare`, `SHARE_BASE` | Share links work only in the Claude-hosted preview; hidden everywhere else. |

### Matching rules worth knowing

- Usage rows with zero billed minutes are excluded from totals but still drawn on the Event timeline.
- With a Transaction report, usage rows that can't be matched to a debit are left out and listed in a notice.
- "Workspaces" in the BigQuery prototype are accounts whose `Service` is a named workspace (not `Active` or `Restricted`).

## Releasing to customers

1. `npm run build`
2. Send `dist/Wordly Usage Dashboard.html` with the guide in `docs/customer-guide.md` (or its PDF).
3. Saved versions live in each customer's browser, so new releases don't affect them.

## Privacy

Never commit customer reports, exported dashboards, or backup files. `.gitignore` blocks the common ones (`*.xlsx`, `*.csv`, dashboard backups), but check before committing.
