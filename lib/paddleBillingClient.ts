/**
 * Minimal Paddle Billing API client (server-only).
 * @see https://developer.paddle.com/api-reference/overview
 */
import { getPaddleApiBaseUrl } from "@/lib/builderPaymentConfig";

type PaddleEnvelope<T> = { data: T; meta?: { request_id?: string } };

type PaddleErrorBody = {
  error?: {
    type?: string;
    code?: string;
    detail?: string;
    message?: string;
  };
};

async function paddleFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const key = process.env.PADDLE_API_KEY?.trim();
  if (!key) throw new Error("PADDLE_API_KEY is not set");

  const base = getPaddleApiBaseUrl();
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as
    | PaddleEnvelope<T>
    | PaddleErrorBody;

  if (!res.ok) {
    const err = json as PaddleErrorBody;
    const detail =
      err.error?.detail ||
      err.error?.message ||
      (typeof json === "object" && json !== null
        ? JSON.stringify(json)
        : res.statusText);
    throw new Error(`Paddle ${res.status}: ${detail}`);
  }

  return json as T;
}

export type PaddleTransactionEntity = {
  id: string;
  status: string;
  custom_data?: Record<string, unknown> | null;
  checkout?: { url: string | null } | null;
};

/**
 * Create an automatically-collected transaction and return Paddle Checkout URL.
 * Set Default payment link in Paddle Checkout settings if checkout.url is missing.
 */
export async function paddleCreateCheckoutTransaction(params: {
  priceId: string;
  quantity?: number;
  customData: Record<string, string>;
  /** Your approved domain + path; Paddle appends ?_ptxn=<transaction_id> */
  checkoutReturnBaseUrl: string;
}): Promise<{ transactionId: string; checkoutUrl: string }> {
  const body = {
    items: [{ price_id: params.priceId, quantity: params.quantity ?? 1 }],
    collection_mode: "automatic",
    custom_data: params.customData,
    checkout: {
      url: params.checkoutReturnBaseUrl.replace(/\/$/, ""),
    },
  };

  const json = await paddleFetch<PaddleEnvelope<PaddleTransactionEntity>>(
    "POST",
    "/transactions",
    body
  );

  const url = json.data.checkout?.url;
  if (!url) {
    throw new Error(
      "Paddle did not return checkout.url. In Paddle Dashboard: Checkout → set a Default payment link, or approve your domain."
    );
  }

  return { transactionId: json.data.id, checkoutUrl: url };
}

export async function paddleGetTransaction(
  transactionId: string
): Promise<PaddleTransactionEntity> {
  const json = await paddleFetch<PaddleEnvelope<PaddleTransactionEntity>>(
    "GET",
    `/transactions/${encodeURIComponent(transactionId)}`
  );
  return json.data;
}
