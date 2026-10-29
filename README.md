# Multi-Document Intelligence Workbench

Small full-stack workbench for structured, evidence-backed analysis of synthetic PDF and TXT documents.

## Structure

- `frontend/` — React, TypeScript, and Vite client
- `backend/` — Express and TypeScript API
- `REQUIREMENTS.md` — source of truth, stored one level above this repository

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies for each package. Running `npm install` from each package directory avoids npm treating the nested apps as workspace links:

   ```bash
   npm install
   cd backend
   npm install
   cd ../frontend
   npm install
   cd ..
   ```

3. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
4. Keep credentials in those local `.env` files. They are ignored by Git.
5. Initialize and verify the existing MySQL database:

   ```bash
   npm run db:init
   npm run db:verify
   ```

   These commands use `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`. The schema targets the existing `document_workbench` database and does not create a second database. `npm run db:verify` checks both connectivity and the four required tables. Run `npm run db:init` after upgrading the application as well; it creates missing tables and adds required columns to older `documents` tables.

6. Start both applications:

   ```bash
   npm run dev
   ```

   The production backend start command runs the compiled idempotent schema initializer before listening. This creates missing tables and upgrades older `documents` columns; it fails startup if the configured database cannot be reached.

To run them separately:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

The frontend runs at `http://localhost:5173`. The backend health endpoint is `http://localhost:3001/api/health`.

The analysis endpoint accepts JSON in this shape:

```json
{
  "sessionId": "<upload-session-id>",
  "instruction": "Compare company names and revenue across these documents."
}
```

It is available at `POST http://localhost:3001/api/analysis` and rejects instructions longer than 2,000 characters.

Mock analysis is the default. To opt into Gemini, set these values in the server-only `backend/.env`:

```dotenv
AI_MODE=gemini
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=your-model-name
ANALYSIS_TIMEOUT_MS=90000
```

Gemini failures, invalid structured output, and timeouts return explicit API errors; the backend does not silently fall back to mock mode. The implementation uses Gemini structured JSON output and then verifies every cited excerpt against the stored source text. See [Google's structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output) and [Generate Content API documentation](https://ai.google.dev/api/generate-content).

## Completed slices

- Application foundation with separate frontend and backend
- Backend health endpoint at `GET /api/health`
- Multi-file PDF/TXT upload at `POST /api/documents/process`
- Per-file UUIDs, validation status, and extracted character counts
- Separate TXT and PDF parser modules
- Safe handling for empty, corrupt, unsupported, oversized, unreadable, and scanned PDF files
- Synthetic fixtures and parser tests
- Deterministic analysis endpoint at `POST /api/analysis`
- Separate extracted facts, interpretations, verification statuses, source filenames, and evidence excerpts
- Conflict and missing-field analysis tests
- Extracted text can be expanded per processed file in the frontend
- Optional server-side Gemini provider with structured JSON and evidence validation
- React workbench UI with file selection, removal, clear-all, drag-and-drop, loading/error states, structured findings, source evidence, and copy feedback
- Instruction-aware deterministic comparisons that avoid unrelated missing-field claims and keep differently labelled dates separate
- Provider-result safeguards that remove unrelated findings and downgrade one-source consistency claims to human review

Upload sessions are cached in backend memory for speed and persisted through `documents.session_id`, so analysis can recover the uploaded documents after a backend restart or instance change. Document metadata, extracted text, analyses, document links, and findings are persisted in MySQL.

The frontend communicates only with the backend through `VITE_API_BASE_URL`. CORS is configured on the backend from `CLIENT_ORIGIN`; the frontend never connects directly to MySQL or receives database credentials.

The backend verifies the MySQL connection before listening. Uploads persist document metadata and extracted text. Analyses persist their instruction, AI mode, summary, document links, and structured findings. Saved results can be retrieved with `GET /api/analysis/:analysisId`.

## Architecture

The frontend is a React/Vite client that communicates only with the Express API using `VITE_API_BASE_URL`. The backend owns file parsing, AI provider calls, MySQL access, validation, and source-evidence checks. The browser never connects to MySQL and never receives database or Gemini credentials.

## Database setup

The existing `document_workbench` database is used; `backend/schema.sql` creates tables idempotently but deliberately does not create another database. The schema contains:

- `documents` — metadata, extracted text, status, and errors
- `analyses` — instruction, AI mode, summary, and timestamps
- `analysis_documents` — ordered analysis-to-document relationships
- `findings` — queryable severity/status fields plus complete structured JSON

All application queries use parameterized placeholders. Run `npm run db:init` after configuring the backend environment, and `npm run db:verify` to check connectivity.

The backend production start command also runs `npm run db:init:compiled` automatically, so a newly provisioned `document_workbench` database does not accept uploads before its tables exist.

## AI modes and limitations

Mock mode is deterministic, local, and the default. It compares labeled facts, respects the instruction, limits missing-field checks to relevant documents, and keeps differently labeled dates separate.

Gemini mode is optional and server-side. It sends bounded source text, requests JSON output, validates the returned structure, verifies every evidence excerpt against source text, and returns explicit provider/API/timeout errors. It never silently falls back to mock mode.

The baseline uses text extraction only. Scanned PDFs are reported safely but are not OCR'd. Sessions are in-memory and are not shared across backend instances. Gemini availability, latency, quotas, and provider output remain external dependencies.

## Testing

```bash
npm test
npm run build
npm run db:verify
```

The automated tests cover TXT/PDF extraction, invalid files, duplicate filenames, instruction-aware comparisons, conflicts, missing fields, distinct date labels, evidence matching, invalid AI output, provider failures, and timeouts. The final smoke test also exercises upload, MySQL persistence, analysis, saved-result retrieval, evidence, and the copy-results UI path with synthetic documents.

## Security and production improvements

Synthetic data only is supported by this baseline. Do not commit `.env` files or credentials. Filenames are sanitized, file sizes/types are bounded, credentials stay server-side, and SQL uses parameters.

Before production, add authentication and authorization, rate limiting, malware scanning, encryption in transit and at rest, audit logging, retention/deletion policies, session storage suitable for multiple instances, secret management, stricter CORS, provider data-processing review, OCR isolation, and operational monitoring.

## AI tool disclosure

AI assistance was used to help inspect the requirements, compare the working copy, draft implementation changes, and generate test cases. Engineering decisions retained by the project include the simple frontend/backend split, deterministic mock default, server-only Gemini access, source-evidence validation, parameterized MySQL persistence, synthetic fixtures, and the documented production limitations.
