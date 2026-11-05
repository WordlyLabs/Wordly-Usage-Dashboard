# BigQuery prototype (internal, on hold)

Serves the dashboard with a customer search screen backed by BigQuery, instead of uploaded report files.

## Data sources

- Sessions: `support-467322.wordly_session_data_central.sessions_clean`, a view over the raw `sessions` table that keeps the newest copy of each session (by `session_id`, `date`, `time`, ordered by `_inserted_at`).
- Balances: `support-467322.wordly_usage_data.usage_with_account_name`, a daily snapshot per account.

## Known data issues (why this is on hold)

1. **Sessions captured mid-session.** The scrape runs once a day around 01:30 UTC and only pulls that day's sessions. Anything still running is saved as 0 seconds / 0 minutes and never re-pulled. Fix: re-pull a rolling 3-day window each night, then backfill.
2. **Workspace balances missing.** Workspaces created under another person's account (for example SBA's "Michael Francis Workspace") have sessions but no row in the balance snapshot.
3. **Mixed time zones.** Times are stored in PDT for some scrapes; the dashboard normalizes and de-duplicates, but the view itself does not.

## Running it

Cloud Shell (no deployment):

```
cd bigquery-prototype
npm install
npm start          # then Web Preview > port 8080
```

It runs with your own Google login. Settings (saved customers, event groups) are stored in `~/wordly-dashboard-data.json`.

Environment variables: `BQ_VIEW`, `BQ_ACCOUNTS`, `MAX_ROWS`, `PORT`, `STORE_FILE`.

For production, the plan was Cloud Run behind Identity-Aware Proxy with a read-only service account, and Firestore instead of the settings file.
