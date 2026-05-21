// File upload component with drag-and-drop and file picker. Selection and
// submission are separate steps: the user picks a file, reviews name/size,
// and clicks Submit to start the pipeline.

"use client";

import { useState, useRef, useCallback } from "react";
import styles from "./FileUpload.module.css";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
];
const ACCEPT_STRING = ".pdf,.jpg,.jpeg,.png,.tiff,.tif";
const MAX_SIZE = 15 * 1024 * 1024;

interface FileUploadProps {
  onSubmit: (file: File) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({ onSubmit, disabled }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = useCallback((candidate: File) => {
    setValidationError(null);

    if (!ACCEPTED_TYPES.includes(candidate.type)) {
      setValidationError("Please choose a PDF or image file (JPEG, PNG, TIFF).");
      return;
    }
    if (candidate.size > MAX_SIZE) {
      setValidationError(`File is too large (${formatSize(candidate.size)}). Maximum is 15 MB.`);
      return;
    }

    setFile(candidate);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) validateAndSet(dropped);
    },
    [validateAndSet],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) validateAndSet(selected);
    },
    [validateAndSet],
  );

  const handleSubmit = () => {
    if (file && !disabled) onSubmit(file);
  };

  const handleClearFile = () => {
    setFile(null);
    setValidationError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_STRING}
          onChange={handleFileChange}
          className={styles.hiddenInput}
          tabIndex={-1}
        />
        <p className={styles.dropLabel}>
          {file ? "" : "Drop a medical record here, or click to browse"}
        </p>
        {file && (
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{file.name}</span>
            <span className={styles.fileSize}>{formatSize(file.size)}</span>
            <button
              className={styles.clearFile}
              onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
              type="button"
            >
              Change file
            </button>
          </div>
        )}
      </div>

      {validationError && (
        <p className={styles.error}>{validationError}</p>
      )}

      {file && (
        <button
          className={styles.submit}
          onClick={handleSubmit}
          disabled={disabled}
        >
          {disabled ? "Processing…" : "Submit"}
        </button>
      )}
    </div>
  );
}
