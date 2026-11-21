// packages/main/src/types/openpgp-unbzip2-stream.d.ts
//
// @openpgp/unbzip2-stream 未提供 .d.ts，也没在 DefinitelyTyped 中。
// 这里按其 index.js 的实际签名手写声明：
//   unbzip2Stream(input: WebReadableStream, maxDecompressedBytes?: number)
//     => WebReadableStream<Uint8Array>
declare module "@openpgp/unbzip2-stream" {
    import type { ReadableStream } from "node:stream/web";

    interface Bz2InputReader {
        read(): Promise<{ value?: Uint8Array; done: boolean }>;
        cancel?(reason?: unknown): Promise<void>;
        abort?(reason?: unknown): Promise<void>;
    }

    interface Bz2InputStream {
        getReader(): Bz2InputReader;
    }

    export default function unbzip2Stream(
        input: Bz2InputStream,
        maxDecompressedBytes?: number,
    ): ReadableStream<Uint8Array>;
}