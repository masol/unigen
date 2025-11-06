let origFetch: (typeof window.fetch) | null = null;

// const proxyFetch = (
//     input: string | URL | Request,
//     init?: RequestInit,
// ): Promise<Response> => {
//     console.log('Intercepted fetch request:', input, init);

//     if (!origFetch) {
//         throw new Error('Original fetch not initialized');
//     }

//     return origFetch(input, init);
// };

export class Proxy {
    async init(): Promise<boolean> {
        // 保存原始的 fetch
        // origFetch = window.fetch;

        // // 拦截 window.fetch
        // window.fetch = proxyFetch;

        // console.log('Fetch proxy initialized');

        return true;
    }

    // 可选：添加一个恢复原始 fetch 的方法
    restore(): void {
        if (origFetch) {
            window.fetch = origFetch;
            console.log('Fetch proxy restored');
        }
    }
}

export const proxy = new Proxy(); 