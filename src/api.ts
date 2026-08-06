const DEFAULT_BASE_URL = "https://api.suwappu.bot";

export interface SuwappuApiConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class SuwappuApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: SuwappuApiConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.SUWAPPU_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | undefined>;
      json?: unknown;
    } = {},
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined) search.set(key, value);
    }
    const query = search.toString();
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
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
      throw new Error(`Suwappu API error ${response.status}: ${message}`);
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

  executeManagedSwap(quoteId: string): Promise<unknown> {
    if (!this.apiKey) {
      return Promise.reject(new Error("SUWAPPU_API_KEY is required for managed execution"));
    }
    return this.request("POST", "/v1/agent/swap/execute", {
      json: { quote_id: quoteId },
    });
  }
}
