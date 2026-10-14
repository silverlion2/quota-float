# Vibe Usage reference: distributions and Markdown

Quota Float already provides local date ranges, custom dates, model/project/terminal filters, token and cost trends, a heatmap and a model ledger. This update adds two complementary capabilities:

- **Where usage goes:** project or terminal ranking in Insights. The Token/Cost switch applies to the distribution; all current date and dimension filters apply. The top eight rows retain shares against the entire selected population. Same-named projects remain separate by opaque project ID. Missing prices are explicit and prevent misleading cost percentages.
- **Markdown summary:** export the current selection as a portable local report. Project names are anonymized; API-equivalent estimates are distinguished from actual bills. The report includes pricing version, selection/coverage context and unknown-pricing information. It uses the existing local export path and adds no network sync.

Feature references: Vibe Usage Windows [DistributionGrid](https://github.com/vibe-cafe/vibe-usage-windows/blob/main/src/components/DistributionGrid.tsx) and Vibe Usage CLI [summary](https://github.com/vibe-cafe/vibe-usage/blob/main/src/summary.js). The implementation is independent TypeScript/Rust using Quota Float's existing data model, aggregation, UI tokens and export infrastructure; no upstream source, assets or CLI are bundled.

The upstream READMEs describe MIT licensing, but the inspected main trees did not expose a license file through the GitHub license API. This update borrows the product ideas only. It does not introduce Vibe Café accounts, uploads, cloud sync, rankings or additional local data readers.

Browser and native UI verification use synthetic data. The production desktop bundle excludes development mock data; a production build opened in a browser explicitly requires the desktop application. Terser uses three compression passes and ES2020 output, within the existing ES2022 source target; JavaScript and CSS budgets remain unchanged.
