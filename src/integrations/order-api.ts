import { createHttpOrderApi } from './order-http';

const url = import.meta.env.VITE_ORDER_API_URL?.trim();
const timeout = Number(import.meta.env.VITE_ORDER_API_TIMEOUT_MS ?? 8000);

// Leave the API undefined to use the project's products with the local mock.
export const orderApi = url ? createHttpOrderApi(url, {
  timeout: Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 8000,
  retries: 0,
}) : undefined;
