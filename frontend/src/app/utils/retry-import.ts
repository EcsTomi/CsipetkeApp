// utils/retry-import.ts
export function retryImport<T>(importFn: () => Promise<T>, retries = 5, delayMs = 3000): Promise<T> {
    return importFn().catch((err) => {
        if (retries <= 0) throw err;
        return new Promise<T>((resolve, reject) => {
            setTimeout(() => {
                retryImport(importFn, retries - 1, delayMs).then(resolve, reject);
            }, delayMs);
        });
    });
}