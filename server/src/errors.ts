import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import type { Logger } from "./logger.js";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class LlmRefusalError extends AppError {
  constructor(category?: string | null) {
    super(
      502,
      "refusal",
      category ? `The model declined to answer (${category}).` : "The model declined to answer.",
    );
    this.name = "LlmRefusalError";
  }
}

export class LlmTruncatedError extends AppError {
  constructor() {
    super(502, "max_tokens", "The answer was cut off before it finished.");
    this.name = "LlmTruncatedError";
  }
}

export interface ErrorBody {
  error: { code: string; message: string };
}

/** Maps any thrown value to a status and the public error body. */
export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  const make = (status: number, code: string, message: string) => ({
    status,
    body: { error: { code, message } },
  });
  if (err instanceof AppError) return make(err.status, err.code, err.message);
  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return make(400, "invalid_request", detail);
  }
  if (err instanceof multer.MulterError) {
    return err.code === "LIMIT_FILE_SIZE"
      ? make(413, "file_too_large", "File exceeds the 10 MB limit.")
      : make(400, "invalid_upload", err.message);
  }
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return make(status, status === 413 ? "payload_too_large" : "bad_request", "Malformed request.");
  }
  return make(500, "internal", "Internal server error.");
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error({ err }, "request failed");
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  };
}
