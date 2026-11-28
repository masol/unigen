// packages/main/src/libs/blueprint/cmd-parse.ts
//
// 将用户输入的原始字符串解析为 CommandInfo（命令名 / 参数 / body）。
//
// 分层约定：
//   - 该模块属于 blueprint 包的公共层，不感知 Runner / Capability；
//   - runner/cmd.ts 与 capability/run-env.ts 都从这里引用，
//     避免 capability → runner 的反向依赖（两者同在 blueprint/ 内，此文件在共同父级）。
//
// 解析规则：
//   - 只有首行可能承载命令与参数，后续行一律视为 body；
//   - 只对首行调用 shell-quote，避免 body 很长时被整段解析；
//   - 排除源码注释 //、/* 开头的内容，避免把源代码误判为命令。

import type { CommandInfo } from "$types/blueprint/context.js";
import { parse, ParseEntry } from "shell-quote";
import yargsParser from "yargs-parser";

/**
 * 安全地将 shell-quote 的每一项还原为字符串
 */
function stringifyToken(token: string | ParseEntry): string {
    if (typeof token === "string") return token;
    if ("pattern" in token) return token.pattern; // 处理 Glob 模式 (如 *.js)
    if ("op" in token) return token.op; // 处理控制符 (如 |, &&)
    if ("comment" in token) return `#${token.comment}`; // 处理注释
    return "";
}

/**
 * 解析用户输入。
 *
 * 注意：
 * - 只有首行可能承载命令与参数，后续行一律视为 body。
 * - 该实现只对首行调用 shell-quote，避免 body 很长时被整段解析。
 * - 排除源码注释 //、/* 开头的内容，避免把源代码误判为命令。
 */
export function parseCommandWithBody(userInput: string): CommandInfo {
    const firstNonWhitespaceIndex = userInput.search(/\S/);
    if (firstNonWhitespaceIndex < 0) {
        return { isCommand: false, body: "" };
    }

    const commandMarker = userInput[firstNonWhitespaceIndex];
    const nextChar = userInput[firstNonWhitespaceIndex + 1];

    // 命令必须以 / 开头；但 // 和 /* 更可能是源码注释，不能当作命令。
    if (commandMarker !== "/" || nextChar === "/" || nextChar === "*") {
        return { isCommand: false, body: userInput.trim() };
    }

    const firstLineEndIndex = userInput.indexOf("\n", firstNonWhitespaceIndex);
    const firstLineRaw =
        firstLineEndIndex === -1
            ? userInput.slice(firstNonWhitespaceIndex)
            : userInput.slice(firstNonWhitespaceIndex, firstLineEndIndex);
    const restRaw =
        firstLineEndIndex === -1 ? "" : userInput.slice(firstLineEndIndex + 1);
    const hasFollowingBody = /\S/.test(restRaw);

    // 只解析首行。后续 body 保持原始文本，避免 shell-quote 处理大文本。
    const firstLine = firstLineRaw.trim();
    const tokens = parse(firstLine);

    // 3. 提取首位的命令，并安全地移除开头的斜杠 '/'
    const rawCommand = tokens.shift();
    if (!rawCommand) {
        return { isCommand: true, command: "", args: {}, body: restRaw.trim() };
    }
    const commandStr = stringifyToken(rawCommand);
    const command = commandStr.startsWith("/") ? commandStr.slice(1) : commandStr;

    // 4. 寻找参数的“终止边界”
    let bodyStartIndex = tokens.length;

    for (let i = 0; i < tokens.length; i++) {
        const tokenStr = stringifyToken(tokens[i]);
        const prevTokenStr = i > 0 ? stringifyToken(tokens[i - 1]) : "";

        // 首行最后一个 token 只有在“后面没有 body 行”时才可能作为 body 起点。
        // 否则它更可能是上一参数的取值，例如：/cmd --model gpt-4\n后续 body。
        const isFirstLineTrailingBodyCandidate =
            i === tokens.length - 1 && !hasFollowingBody;

        // 判定边界：如果碰到了不以 - 开头的长文本（包含换行，或者是普通文本）
        // 且它不像是紧跟在参数名（如 --model）之后的简单参数值，就判定为 body 的起点
        if (
            !tokenStr.startsWith("-") &&
            (tokenStr.includes("\n") ||
                tokenStr.length > 20 ||
                isFirstLineTrailingBodyCandidate ||
                !prevTokenStr.startsWith("-"))
        ) {
            bodyStartIndex = i;
            break;
        }
    }

    // 5. 切分出参数数组和 Body 数组
    const argsTokens = tokens.slice(0, bodyStartIndex);
    const bodyTokens = tokens.slice(bodyStartIndex);

    // 6. 转化参数为键值对对象
    const argsStrings = argsTokens.map(stringifyToken);
    const fullParsedArgs = yargsParser(argsStrings);

    // 💡 使用解构赋值剔除 '_' 属性，将剩余的参数存入 cleanArgs 中
    const { _, ...cleanArgs } = fullParsedArgs;

    // 7. 还原 body 文本。首行 body token 继续沿用原有 stringify 逻辑；
    // 后续行保持原始文本，避免大文本被 shell-quote 逐 token 解析。
    const bodyFromFirstLine = bodyTokens.map(stringifyToken).join(" ");
    const bodyWithFollowingLines = bodyFromFirstLine
        ? restRaw
            ? `${bodyFromFirstLine}\n${restRaw}`
            : bodyFromFirstLine
        : restRaw;
    const bodyText = bodyWithFollowingLines.trim();

    return {
        isCommand: true,
        command,
        args: cleanArgs,
        body: bodyText,
    };
}