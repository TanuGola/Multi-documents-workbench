import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type LocalFile = {
  id: string;
  file: File;
  selected: boolean;
};

type ProcessedFile = {
  id: string;
  filename: string;
  status: string;
  sizeBytes: number;
  characterCount: number;
  extractedText: string;
  error?: string;
};

type ExtractedFact = {
  field: string;
  value: string;
  sourceFilename: string;
  evidenceExcerpt: string;
};

type Finding = {
  findingId: string;
  title: string;
  category: string;
  severity: string;
  verificationStatus: string;
  interpretation: string;
  sourceFilenames: string[];
  extractedFacts: ExtractedFact[];
  supportingEvidence: string[];
  missingInformation: string[];
};

type AnalysisResult = {
  summary: string;
  findings: Finding[];
};

type ApiMode = "checking" | "offline" | "mock" | "gemini";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

function App() {
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult>();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string>();
  const [copyFeedback, setCopyFeedback] = useState<string>();
  const [apiMode, setApiMode] = useState<ApiMode>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("API health check failed.");
        return response.json() as Promise<{ aiMode?: string }>;
      })
      .then((payload) => setApiMode(payload.aiMode === "gemini" ? "gemini" : "mock"))
      .catch((healthError: unknown) => {
        if (healthError instanceof DOMException && healthError.name === "AbortError") return;
        setApiMode("offline");
      });
    return () => controller.abort();
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;
    setLocalFiles((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: `${file.name}-${file.lastModified}-${file.size}-${crypto.randomUUID()}`,
        file,
        selected: true,
      })),
    ]);
    setError(undefined);
  }

  function clearResults() {
    setProcessedFiles([]);
    setSessionId(undefined);
    setAnalysis(undefined);
    setCopyFeedback(undefined);
  }

  function removeFile(id: string) {
    setLocalFiles((current) => current.filter((item) => item.id !== id));
    clearResults();
  }

  function clearAll() {
    setLocalFiles([]);
    clearResults();
    setInstruction("");
    setError(undefined);
  }

  function toggleFile(id: string) {
    setLocalFiles((current) => current.map((item) => item.id === id ? { ...item, selected: !item.selected } : item));
  }

  function selectAllFiles(selected: boolean) {
    setLocalFiles((current) => current.map((item) => ({ ...item, selected })));
  }

  async function processFiles() {
    const filesToUpload = localFiles.filter((item) => item.selected).map((item) => item.file);
    if (filesToUpload.length === 0) {
      setError("Select at least one PDF or TXT file from the list.");
      return;
    }
    setIsUploading(true);
    setError(undefined);
    clearResults();
    const formData = new FormData();
    filesToUpload.forEach((file) => formData.append("documents", file));
    try {
      const response = await fetch(`${apiBaseUrl}/api/documents/process`, { method: "POST", body: formData });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Upload failed.");
      setSessionId(payload.sessionId as string);
      setProcessedFiles(payload.files as ProcessedFile[]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  async function analyzeFiles() {
    if (!sessionId || !instruction.trim()) {
      setError("Enter an instruction before analyzing.");
      return;
    }
    setIsAnalyzing(true);
    setError(undefined);
    setCopyFeedback(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/api/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, instruction: instruction.trim() }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Analysis failed.");
      setAnalysis(payload as AnalysisResult);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function copyResults() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(formatAnalysisForCopy(analysis));
      setCopyFeedback("Results copied");
    } catch {
      setCopyFeedback("Copy failed. Select and copy the results manually.");
    }
  }

  const selectedCount = localFiles.filter((item) => item.selected).length;
  const processedCount = processedFiles.filter((file) => file.status === "processed").length;

  return (
    <main className="app-shell">
      <header>
        <div className="topline"><p className="eyebrow">Document workbench</p><span className={`api-mode api-mode-${apiMode}`}>{apiMode === "checking" ? "Checking API" : apiMode === "offline" ? "API offline" : `${apiMode} mode`}</span></div>
        <h1>Compare source documents</h1>
        <p className="intro">Select multiple PDF or TXT files, inspect their extracted text, and request evidence-backed findings.</p>
      </header>

      <label
        className={`drop-zone${isDragging ? " drop-zone-active" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}
      >
        <span>{isDragging ? "Drop files here" : "Choose or drop files"}</span>
        <small>PDF or TXT · up to 10 files per request · 10 MB per file</small>
        <input type="file" accept=".pdf,.txt,application/pdf,text/plain" multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }} />
      </label>

      {localFiles.length > 0 && <section className="file-list" aria-label="Selected files">
        <div className="section-heading">
          <h2>Files</h2>
          <div className="selection-actions">
            <span>{selectedCount} of {localFiles.length} selected</span>
            <button type="button" onClick={() => selectAllFiles(true)} disabled={isUploading}>Select all</button>
            <button type="button" onClick={() => selectAllFiles(false)} disabled={isUploading}>Select none</button>
          </div>
        </div>
        {localFiles.map((item) => <div className="file-row" key={item.id}>
          <label className="file-choice">
            <input type="checkbox" checked={item.selected} onChange={() => toggleFile(item.id)} disabled={isUploading} />
            <span>{item.file.name}</span>
          </label>
          <small>{formatBytes(item.file.size)}</small>
          <button type="button" onClick={() => removeFile(item.id)} disabled={isUploading}>Remove</button>
        </div>)}
      </section>}

      <div className="actions">
        <button type="button" className="primary" onClick={processFiles} disabled={isUploading || selectedCount === 0}>{isUploading ? "Processing documents..." : `Process ${selectedCount || "selected"} documents`}</button>
        <button type="button" onClick={clearAll} disabled={isUploading || isAnalyzing}>Clear all</button>
      </div>

      {isUploading && <p className="message loading" role="status">Validating files and extracting text...</p>}
      {isAnalyzing && <p className="message loading" role="status">Analyzing documents and comparing findings...</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {sessionId && <p className="message success">Session ready with {processedCount} readable document{processedCount === 1 ? "" : "s"}.</p>}

      {processedFiles.length > 0 && <section className="results" aria-label="Processing status">
        <div className="section-heading"><h2>Processing status</h2><span>{processedFiles.length} response{processedFiles.length === 1 ? "" : "s"}</span></div>
        {processedFiles.map((file) => <div className="result-row" key={file.id}>
          <div><strong>{file.filename}</strong><small>{file.characterCount ? `${file.characterCount.toLocaleString()} characters extracted` : file.error ?? "No text extracted"}</small></div>
          <span className={`badge badge-${file.status}`}>{file.status.replace(/_/g, " ")}</span>
          {file.status === "processed" && <details className="extracted-text"><summary>View extracted text</summary><pre>{file.extractedText}</pre></details>}
        </div>)}
      </section>}

      {sessionId && processedCount > 0 && <section className="analysis-panel">
        <div className="section-heading"><h2>Analysis instruction</h2><span>{instruction.length}/2000</span></div>
        <textarea maxLength={2000} value={instruction} onChange={(event) => { setInstruction(event.target.value); setError(undefined); }} placeholder="For example: Compare company names and revenue across these documents." />
        <div className="analysis-actions"><small>Describe the comparison or facts you want reviewed.</small><button type="button" className="primary" onClick={analyzeFiles} disabled={isAnalyzing || !instruction.trim()}>{isAnalyzing ? "Analyzing..." : "Analyze documents"}</button></div>
      </section>}

      {analysis && <section className="results" aria-label="Analysis findings">
        <div className="section-heading"><h2>Findings</h2><button type="button" onClick={copyResults}>Copy results</button></div>
        {copyFeedback && <p className="copy-feedback" role="status">{copyFeedback}</p>}
        <p className="summary">{analysis.summary}</p>
        {analysis.findings.map((finding) => <article className="finding" key={finding.findingId}>
          <div className="finding-heading"><div><h3>{finding.title}</h3><small>{finding.category} · {finding.severity} severity</small></div><span className={`badge badge-${finding.verificationStatus}`}>{finding.verificationStatus.replace(/_/g, " ")}</span></div>
          <p>{finding.interpretation}</p>
          <small>Sources: {finding.sourceFilenames.join(", ") || "None"}</small>
          {finding.extractedFacts.length > 0 && <div className="evidence-list"><strong>Extracted facts</strong>{finding.extractedFacts.map((fact) => <div key={`${fact.sourceFilename}-${fact.field}-${fact.value}`}><span>{fact.field}: {fact.value}</span><small>{fact.sourceFilename} — “{fact.evidenceExcerpt}”</small></div>)}</div>}
          {finding.supportingEvidence.length > 0 && <div className="evidence-list"><strong>Supporting evidence</strong>{finding.supportingEvidence.map((evidence) => <small key={evidence}>“{evidence}”</small>)}</div>}
          {finding.missingInformation.length > 0 && <div className="missing-list"><strong>Missing information</strong>{finding.missingInformation.map((item) => <small key={item}>{item}</small>)}</div>}
        </article>)}
      </section>}
    </main>
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => ({}));
  return payload as Record<string, unknown>;
}

function formatAnalysisForCopy(analysis: AnalysisResult): string {
  return [
    "MULTI-DOCUMENT ANALYSIS",
    analysis.summary,
    ...analysis.findings.map((finding, index) => [
      `\n${index + 1}. ${finding.title}`,
      `Category: ${finding.category}`,
      `Severity: ${finding.severity}`,
      `Status: ${finding.verificationStatus}`,
      `Interpretation: ${finding.interpretation}`,
      `Sources: ${finding.sourceFilenames.join(", ") || "None"}`,
      finding.extractedFacts.length ? `Extracted facts:\n${finding.extractedFacts.map((fact) => `- ${fact.field}: ${fact.value} [${fact.sourceFilename}] Evidence: ${fact.evidenceExcerpt}`).join("\n")}` : "",
      finding.supportingEvidence.length ? `Supporting evidence:\n${finding.supportingEvidence.map((evidence) => `- ${evidence}`).join("\n")}` : "",
      finding.missingInformation.length ? `Missing information:\n${finding.missingInformation.map((item) => `- ${item}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),),
  ].join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
