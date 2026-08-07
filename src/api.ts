const DEFAULT_BASE_URL = "https://api.suwappu.bot";
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface SuwappuApiConfig {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function isValidIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_RE.test(value);
}

export class SuwappuApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SuwappuApiError";
  }
}

export class SuwappuApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: SuwappuApiConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.SUWAPPU_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | undefined>;
      json?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) search.set(key, value);
    }
    const query = search.toString();
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        ...options.headers,
      },
      ...(options.json !== undefined ? { body: JSON.stringify(options.json) } : {}),
    });

    const text = await response.text();
    if (!response.ok) {
      let message = text || response.statusText;
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        message = parsed.message ?? parsed.error ?? message;
      } catch {
        // Keep the raw response text when the body is not JSON.
      }
      throw new SuwappuApiError(
        response.status,
        `Suwappu API error ${response.status}: ${message}`,
      );
    }

    return (text ? JSON.parse(text) : {}) as T;
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
  }): Promise<unknown> {
    return this.request("POST", "/v1/agent/quote", {
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
    });
  }

  prepareSwap(quoteId: string, walletAddress: string): Promise<unknown> {
    return this.request("POST", "/v1/agent/swap", {
      json: { quote_id: quoteId, wallet_address: walletAddress },
    });
  }

  simulateSwap(quoteId: string, walletAddress: string): Promise<unknown> {
    return this.request("POST", "/v1/agent/swap/simulate", {
      json: { quote_id: quoteId, wallet_address: walletAddress },
    });
  }

  executeManagedSwap(quoteId: string, idempotencyKey: string): Promise<unknown> {
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
    return this.request("POST", "/v1/agent/swap/execute", {
      json: { quote_id: quoteId },
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  getSwapStatus(swapId: number): Promise<unknown> {
    return this.request("GET", `/v1/agent/swap/status/${swapId}`);
  }

  getSwapHistory(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<unknown> {
    return this.request("GET", "/v1/agent/swaps", {
      params: {
        status: options.status,
        limit: options.limit === undefined ? undefined : String(options.limit),
        offset: options.offset === undefined ? undefined : String(options.offset),
      },
    });
  }
}
