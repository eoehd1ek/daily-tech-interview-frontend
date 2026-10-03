import axios from "axios";
import type { ApiError, ApiErrorResponse } from "./types";

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim();

if (!configuredBaseURL) {
  throw new Error("VITE_API_BASE_URL is required. Set the API server origin and restart Vite.");
}

let serverURL: URL;

try {
  serverURL = new URL(configuredBaseURL);
} catch {
  throw new Error("VITE_API_BASE_URL must be a valid HTTP or HTTPS server origin.");
}

if (
  !/^https?:\/\//i.test(configuredBaseURL) ||
  !["http:", "https:"].includes(serverURL.protocol) ||
  serverURL.username ||
  serverURL.password ||
  serverURL.pathname !== "/" ||
  serverURL.search ||
  serverURL.hash
) {
  throw new Error("VITE_API_BASE_URL must contain only the HTTP or HTTPS server origin, without /api, credentials, query or fragment.");
}

// Each request supplies its full contract path, starting with /api.
export const apiClient = axios.create({
  baseURL: serverURL.origin,
  headers: { Accept: "application/json" },
});

export function getApiError(error: unknown): ApiError {
  if (axios.isCancel(error)) {
    return { message: "", isCanceled: true };
  }

  const fallbackMessage = "요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.";

  if (!axios.isAxiosError<unknown>(error)) {
    return { message: fallbackMessage, isCanceled: false };
  }

  const status = error.response?.status;
  const data = error.response?.data;

  if (isApiErrorResponse(data)) {
    return {
      status,
      code: data.code,
      message: data.message.trim() ? data.message : fallbackMessage,
      isCanceled: false,
    };
  }

  return { status, message: fallbackMessage, isCanceled: false };
}

function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    "code" in data &&
    typeof data.code === "string" &&
    "message" in data &&
    typeof data.message === "string"
  );
}
