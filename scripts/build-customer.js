// Builds the customer file: dist/Wordly Usage Dashboard.html
// Same page as src/index.html, with the Excel and chart libraries built in so it works offline
// and behind firewalls that block CDNs.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const src = read("src/index.html");
const xlsx = read("node_modules/xlsx/dist/xlsx.full.min.js");
const chart = read("node_modules/chart.js/dist/chart.umd.js");

const XLSX_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>';
const CHART_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>';
for (const [name, tag] of [["SheetJS", XLSX_TAG], ["Chart.js", CHART_TAG]]) {
  if (src.split(tag).length !== 2) throw new Error(`Expected exactly one ${name} <script> tag in src/index.html`);
}
const safe = t => t.replace(/<\/script/gi, "<\\/script");
const out = src
  .replace(XLSX_TAG, () => `<script id="lib-xlsx">${safe(xlsx)}</script>`)
  .replace(CHART_TAG, () => `<script id="lib-chart">${safe(chart)}</script>`);

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const target = path.join(root, "dist", "Wordly Usage Dashboard.html");
fs.writeFileSync(target, out);
console.log(`Built ${path.relative(root, target)} (${(out.length / 1e6).toFixed(2)} MB)`);
