
export class AnalysisError extends Error {
  constructor(status, code, message, retryAfter = null) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function publicAnalysisError(error) {
  if (error instanceof AnalysisError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "분석 중 오류가 발생했습니다.",
    retryAfter: null,
  };
}
