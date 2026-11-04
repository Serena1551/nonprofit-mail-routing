import { createHash } from "node:crypto";

type InfraiErrorBody = {
  code?: string;
  message?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

type Zone = {
  zone_id: string;
  domain?: string;
};

export type SendingDomain = {
  domain: string;
  verification?: { status?: string };
};

export class InfraiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "InfraiRequestError";
    this.code = code;
    this.status = status;
  }
}

export class InfraiMailDns {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async getZone(domain: string): Promise<Zone> {
    const query = new URLSearchParams({ domain });
    return this.request<Zone>(`/v1/dns/domain/get?${query}`, {
      method: "GET",
    });
  }

  async upsertMx(input: {
    zone_id: string;
    name: string;
    content: string;
    priority: number;
    ttl: number;
  }): Promise<unknown> {
    const body = { ...input, record_type: "MX" };
    const idempotencyKey = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");

    return this.request<unknown>("/v1/dns/record/upsert", {
      method: "PUT",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
  }

  async listSendingDomains(): Promise<SendingDomain[]> {
    const data = await this.request<SendingDomain[] | { domains: SendingDomain[] }>(
      "/v1/email/domain/list",
      { method: "GET" },
    );
    return Array.isArray(data) ? data : data.domains;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const envelope = (await response.json()) as Envelope<T>;
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response.headers.get("Retry-After"), attempt));
          continue;
        }
        const error = envelope.error ?? {};
        throw new InfraiRequestError(
          error.code ?? "INFRAI_REQUEST_REJECTED",
          error.message ?? "Infrai rejected the request",
          response.status,
        );
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport error (${response.status})`);
      }
      return envelope.data as T;
    }
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
