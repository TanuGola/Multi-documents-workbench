-- Idempotent schema for the existing document_workbench database.
-- Select the database through MYSQL_DATABASE; this file does not create a database.

CREATE TABLE IF NOT EXISTS documents (
  id CHAR(36) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  character_count INT UNSIGNED NOT NULL DEFAULT 0,
  extracted_text LONGTEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_documents_status (status),
  KEY idx_documents_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analyses (
  id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  instruction VARCHAR(2000) NOT NULL,
  ai_mode VARCHAR(20) NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_analyses_session_id (session_id),
  KEY idx_analyses_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analysis_documents (
  analysis_id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  upload_order SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (analysis_id, document_id),
  UNIQUE KEY uq_analysis_document_order (analysis_id, upload_order),
  CONSTRAINT fk_analysis_documents_analysis
    FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_documents_document
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS findings (
  id CHAR(36) NOT NULL,
  analysis_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  verification_status VARCHAR(30) NOT NULL,
  interpretation TEXT NOT NULL,
  extracted_facts JSON NOT NULL,
  source_document_ids JSON NOT NULL,
  source_filenames JSON NOT NULL,
  supporting_evidence JSON NOT NULL,
  missing_information JSON NOT NULL,
  finding_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_findings_analysis_id (analysis_id),
  KEY idx_findings_status (verification_status),
  KEY idx_findings_severity (severity),
  CONSTRAINT fk_findings_analysis
    FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
