import { createCalculationResult } from "./calculator";
import { renderFrontend } from "./frontend";
import type { CalculationRequest, ErrorResponse } from "./types";

export interface Env {}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?: () => void;
}

function isValidOperation(op: string): op is "add" | "subtract" | "multiply" | "divide" {
  return ["add", "subtract", "multiply", "divide"].includes(op);
}

function createErrorResponse(error: string, message: string, status: number): Response {
  const errorBody: ErrorResponse = { error, message };
  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function handleCalculate(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return createErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Only POST method is allowed",
      405
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      "INVALID_JSON",
      "Request body must be valid JSON",
      400
    );
  }

  if (!body || typeof body !== "object") {
    return createErrorResponse(
      "INVALID_REQUEST",
      "Request body must be an object",
      400
    );
  }

  const payload = body as Record<string, unknown>;

  if (typeof payload.a !== "number" || typeof payload.b !== "number") {
    return createErrorResponse(
      "INVALID_OPERANDS",
      "Both 'a' and 'b' must be numbers",
      400
    );
  }

  if (typeof payload.operation !== "string" || !isValidOperation(payload.operation)) {
    return createErrorResponse(
      "INVALID_OPERATION",
      "Operation must be one of: add, subtract, multiply, divide",
      400
    );
  }

  const calcRequest: CalculationRequest = {
    a: payload.a,
    b: payload.b,
    operation: payload.operation,
  };

  try {
    const result = createCalculationResult(
      calcRequest.a,
      calcRequest.b,
      calcRequest.operation
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return createErrorResponse(
      "CALCULATION_ERROR",
      String(error),
      400
    );
  }
}

export async function handleRequest(
  request: Request,
  _env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return renderFrontend();
  }

  if (url.pathname === "/api/calculate") {
    return handleCalculate(request);
  }

  if (url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
}

export default { fetch: handleRequest };
