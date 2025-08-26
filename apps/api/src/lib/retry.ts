// apps/api/src/lib/retry.ts
// Exponential backoff with jitter + per-attempt timeout + retriable filter
export type RetryOptions = {
  retries?: number;         // 최대 재시도 횟수 (기본 3)
  baseDelayMs?: number;     // 초기 대기 (기본 500ms)
  maxDelayMs?: number;      // 최대 대기 (기본 8000ms)
  timeoutMs?: number;       // 각 시도 타임아웃 (기본 30000ms)
  isRetriable?: (err: any) => boolean;
  onAttempt?: (info: { attempt: number; delayMs: number; error?: any }) => void;
};

export async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    timeoutMs = 30_000,
    isRetriable = defaultRetriable,
    onAttempt,
  } = opts;

  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    let settled = false;            // ✅ 승패 확정 플래그
    let t: NodeJS.Timeout | null = null;

    // 타임아웃 Promise (승자 확정 되면 reject 방지)
    const timeoutP = new Promise<never>((_, rej) => {
      t = setTimeout(() => {
        if (settled) return;        // ✅ 이미 다른 쪽이 완료되면 무시
        ctrl.abort();
        const err = new Error('AttemptTimeout');
        (err as any).name = 'AbortError';
        rej(err);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        (async () => {
          const r = await fn(ctrl.signal);
          settled = true;           // ✅ 승자 확정
          return r;
        })(),
        timeoutP
      ]);
      if (t) clearTimeout(t);       // ✅ 타이머 정리
      return result as T;
    } catch (e: any) {
      if (t) clearTimeout(t);       // ✅ 실패 시에도 정리
      lastErr = e;

      // 마지막 시도이거나 재시도 불가면 즉시 throw
      if (attempt === retries || !isRetriable(e)) {
        throw e;
      }

      const delayMs = Math.min(
        maxDelayMs,
        Math.round(baseDelayMs * Math.pow(2, attempt) + Math.random() * 200)
      );

      onAttempt?.({ attempt: attempt + 1, delayMs, error: e });
      await sleep(delayMs);
    }
  }

  throw lastErr;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function defaultRetriable(err: any): boolean {
  if (err?.name === 'AbortError') return true; // 시도 타임아웃도 재시도 허용
  const code = err?.code || err?.cause?.code;
  if (['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EAI_AGAIN'].includes(code)) return true;
  const status = err?.status ?? err?.statusCode;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status <= 599) return true;
  return false;
}