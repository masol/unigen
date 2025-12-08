import { z } from 'zod';

export async function callLlmWithValidation<T extends z.ZodType>(options: {
    schema: T;
    llmCall: (prompt: string) => Promise<unknown>;
    basePrompt: string;
    maxRetries?: number;
    buildRetryHint?: (errors: readonly { path: PropertyKey[]; message: string }[]) => string;
}): Promise<z.infer<T> | undefined> {
    const {
        schema,
        llmCall,
        basePrompt,
        maxRetries = 3,
        buildRetryHint = defaultRetryHint,
    } = options;

    let suffix = "";

    for (let i = 0; i <= maxRetries; i++) {
        const rawResult = await llmCall(basePrompt + suffix);
        // console.log("rawResult=", rawResult)

        const parseResult = schema.safeParse(rawResult);

        // console.log("parseResult=", parseResult)

        if (parseResult.success) {
            return parseResult.data;
        }

        console.log(`第 ${i + 1} 次尝试验证失败:`);
        parseResult.error.issues.forEach((issue) => {
            console.log(`  - 字段 "${issue.path.map(String).join(".")}": ${issue.message}`);
        });

        suffix = buildRetryHint(parseResult.error.issues);
    }

    return undefined;
}

function defaultRetryHint(
    issues: readonly { path: PropertyKey[]; message: string }[]
): string {
    let hint = "\n注意：上次你缺失了如下字段，本次请着重关注：\n";
    issues.forEach((issue) => {
        hint += `  - 字段 "${issue.path.map(String).join(".")}": ${issue.message}\n`;
    });
    return hint;
}