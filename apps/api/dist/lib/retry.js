export async function withRetry(fn, retries = 3, delayMs = 1500) {
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (e) {
            lastErr = e;
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw lastErr;
}
