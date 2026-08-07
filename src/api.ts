const DEFAULT_BASE_URL = "https://api.suwappu.bot";
const DEFAULT_TIMEOUT_MS = 30_000;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export type SuwappuApiEventOutcome =
  | "success"
  | "http_error"
  | "timeout"
  | "network_error"
  | "protocol_error";

export interface SuwappuApiEvent {
  method: string;
  path: string;
  outcome: SuwappuApiEventOutcome;
  durationMs: number;
  status?: number;
  requestId?: string;
}

export type SuwappuApiEventHandler = (event: SuwappuApiEvent) => void;

export interface SuwappuApiConfig {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Receives request metadata only; bodies and authorization headers are never emitted. */
  onEvent?: SuwappuApiEventHandler;
}

export interface SuwappuQuoteResponse {
  quote_id: string;
  [key: string]: unknown;
}

export interface SuwappuSimulationResponse {
  quote_id: string;
  would_execute: boolean;
  [key: string]: unknown;
}

export interface SuwappuManagedSwapResponse {
  swap_id: number;
  status: string;
  [key: string]: unknown;
}

export interface SuwappuSwapStatusResponse {
  swap_id: number;
  status: string;
  [key: string]: unknown;
}

export interface SuwappuSwapHistoryResponse {
  swaps: unknown[];
  [key: string]: unknown;
}

export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_RE.test(value);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - Date.now());
}

function telemetryPath(path: string): string {
  if (path.startsWith("/v1/agent/swap/status/")) {
    return "/v1/agent/swap/status/:id";
  }
  return path;
}

function requireRecord(value: unknown, operation: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${operation} response must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function validateQuote(value: unknown): SuwappuQuoteResponse {
  const data = requireRecord(value, "quote");
  if (typeof data.quote_id !== "string" || !data.quote_id) {
    throw new Error("quote response is missing quote_id");
  }
  return data as SuwappuQuoteResponse;
}

function validateSimulation(value: unknown): SuwappuSimulationResponse {
  const data = requireRecord(value, "simulation");
  if (typeof data.quote_id !== "string" || !data.quote_id) {
    throw new Error("simulation response is missing quote_id");
  }
  if (typeof data.would_execute !== "boolean") {
    throw new Error("simulation response is missing would_execute");
  }
  return data as SuwappuSimulationResponse;
}

function validateManagedSwap(value: unknown): SuwappuManagedSwapResponse {
  const data = requireRecord(value, "managed execution");
  if (!Number.isInteger(data.swap_id) || Number(data.swap_id) <= 0) {
    throw new Error("managed execution response is missing a valid swap_id");
  }
  if (typeof data.status !== "string" || !data.status) {
    throw new Error("managed execution response is missing status");
  }
  return data as SuwappuManagedSwapResponse;
}

function validateSwapStatus(value: unknown): SuwappuSwapStatusResponse {
  const data = requireRecord(value, "swap status");
  if (!Number.isInteger(data.swap_id) || Number(data.swap_id) <= 0) {
    throw new Error("swap status response is missing a valid swap_id");
  }
  if (typeof data.status !== "string" || !data.status) {
    throw new Error("swap status response is missing status");
  }
  return data as SuwappuSwapStatusResponse;
}

function validateSwapHistory(value: unknown): SuwappuSwapHistoryResponse {
  const data = requireRecord(value, "swap history");
  if (!Array.isArray(data.swaps)) {
    throw new Error("swap history response is missing swaps[]");
  }
  return data as SuwappuSwapHistoryResponse;
}

export class SuwappuApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SuwappuApiError";
  }
}

export class SuwappuTransportError extends Error {
  constructor(
    readonly kind: "timeout" | "network_error",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SuwappuTransportError";
  }
}

export class SuwappuProtocolError extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SuwappuProtocolError";
  }
}

export class SuwappuApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly onEvent?: SuwappuApiEventHandler;

  constructor(config: SuwappuApiConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.SUWAPPU_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive finite number");
    }
    this.onEvent = config.onEvent;
  }

  private emit(event: SuwappuApiEvent): void {
    try {
      this.onEvent?.(event);
    } catch {
      // An observability sink must never change a request's business outcome.
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | undefined>;
      json?: unknown;
      headers?: Record<string, string>;
      validate?: (value: unknown) => T;
    } = {},
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) search.set(key, value);
    }
    const query = search.toString();
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    const eventPath = telemetryPath(path);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          ...options.headers,
        },
        ...(options.json !== undefined ? { body: JSON.stringify(options.json) } : {}),
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      clearTimeout(timeout);
      this.emit({
        method,
        path: eventPath,
        outcome: timedOut ? "timeout" : "network_error",
        durationMs: Date.now() - startedAt,
      });
      throw new SuwappuTransportError(
        timedOut ? "timeout" : "network_error",
        timedOut
          ? `Suwappu API request timed out after ${this.timeoutMs}ms`
          : "Suwappu API network request failed",
        { cause: error },
      );
    }

    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("x-correlation-id") ??
      undefined;
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const timedOut = controller.signal.aborted;
      this.emit({
        method,
        path: eventPath,
        outcome: timedOut ? "timeout" : "network_error",
        durationMs: Date.now() - startedAt,
        status: response.status,
        requestId,
      });
      throw new SuwappuTransportError(
        timedOut ? "timeout" : "network_error",
        timedOut
          ? `Suwappu API request timed out after ${this.timeoutMs}ms while reading the response`
          : "Suwappu API response body could not be read",
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      let message = text || response.statusText;
      let code: string | undefined;
      try {
        const parsed = JSON.parse(text) as {
          error?: string;
          message?: string;
          error_code?: string;
          code?: string;
        };
        message = parsed.message ?? parsed.error ?? message;
        code = parsed.error_code ?? parsed.code;
      } catch {
        // Keep the raw response text when the body is not JSON.
      }
      message = message.slice(0, 1_000);
      this.emit({
        method,
        path: eventPath,
        outcome: "http_error",
        durationMs: Date.now() - startedAt,
        status: response.status,
        requestId,
      });
      throw new SuwappuApiError(
        response.status,
        `Suwappu API error ${response.status}: ${message}`,
        code,
        requestId,
        parseRetryAfterMs(response.headers.get("retry-after")),
      );
    }

    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        this.emit({
          method,
          path: eventPath,
          outcome: "protocol_error",
          durationMs: Date.now() - startedAt,
          status: response.status,
          requestId,
        });
        throw new SuwappuProtocolError(
          "Suwappu API returned a successful response with invalid JSON",
          requestId,
          { cause: error },
        );
      }
    }

    if (options.validate) {
      try {
        data = options.validate(data);
      } catch (error) {
        this.emit({
          method,
          path: eventPath,
          outcome: "protocol_error",
          durationMs: Date.now() - startedAt,
          status: response.status,
          requestId,
        });
        throw new SuwappuProtocolError(
          `Suwappu API response contract failed: ${error instanceof Error ? error.message : "invalid payload"}`,
          requestId,
          { cause: error },
        );
      }
    }

    this.emit({
      method,
      path: eventPath,
      outcome: "success",
      durationMs: Date.now() - startedAt,
      status: response.status,
      requestId,
    });

    return data as T;
  }

  getPortfolio(walletAddress: string, chain?: string): Promise<unknown> {
    return this.request("GET", "/v1/agent/portfolio", {
      params: { wallet_address: walletAddress, chain },
    });
  }

  getPrices(symbols: string, chain?: string): Promise<unknown> {
    return this.request("GET", "/v1/agent/prices", {
      params: { symbols, chain },
    });
  }

  listChains(): Promise<unknown> {
    return this.request("GET", "/v1/agent/chains");
  }

  listTokens(options: { chain?: string; search?: string } = {}): Promise<unknown> {
    return this.request("GET", "/v1/agent/tokens", {
      params: { chain: options.chain, search: options.search },
    });
  }

  getQuote(input: {
    fromToken: string;
    toToken: string;
    amount: number;
    chain?: string;
    fromChain?: string;
    toChain?: string;
    walletAddress?: string;
    slippage?: number;
  }): Promise<SuwappuQuoteResponse> {
    return this.request<SuwappuQuoteResponse>("POST", "/v1/agent/quote", {
      json: {
        from_token: input.fromToken,
        to_token: input.toToken,
        amount: String(input.amount),
        chain: input.chain,
        from_chain: input.fromChain,
        to_chain: input.toChain,
        wallet_address: input.walletAddress,
        slippage: input.slippage,
      },
      validate: validateQuote,
    });
  }

  prepareSwap(quoteId: string, walletAddress: string): Promise<unknown> {
    return this.request("POST", "/v1/agent/swap", {
      json: { quote_id: quoteId, wallet_address: walletAddress },
    });
  }

  simulateSwap(quoteId: string, walletAddress: string): Promise<SuwappuSimulationResponse> {
    return this.request<SuwappuSimulationResponse>("POST", "/v1/agent/swap/simulate", {
      json: { quote_id: quoteId, wallet_address: walletAddress },
      validate: validateSimulation,
    });
  }

  executeManagedSwap(
    quoteId: string,
    idempotencyKey: string,
  ): Promise<SuwappuManagedSwapResponse> {
    if (!this.apiKey) {
      return Promise.reject(new Error("SUWAPPU_API_KEY is required for managed execution"));
    }
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return Promise.reject(
        new Error(
          "Idempotency key must be 1-64 characters using A-Z, a-z, 0-9, _, ., :, or -",
        ),
      );
    }
    return this.request<SuwappuManagedSwapResponse>("POST", "/v1/agent/swap/execute", {
      json: { quote_id: quoteId },
      headers: { "Idempotency-Key": idempotencyKey },
      validate: validateManagedSwap,
    });
  }

  getSwapStatus(swapId: number): Promise<SuwappuSwapStatusResponse> {
    return this.request<SuwappuSwapStatusResponse>(
      "GET",
      `/v1/agent/swap/status/${swapId}`,
      { validate: validateSwapStatus },
    );
  }

  getSwapHistory(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SuwappuSwapHistoryResponse> {
    return this.request<SuwappuSwapHistoryResponse>("GET", "/v1/agent/swaps", {
      params: {
        status: options.status,
        limit: options.limit === undefined ? undefined : String(options.limit),
        offset: options.offset === undefined ? undefined : String(options.offset),
      },
      validate: validateSwapHistory,
    });
  }
}
