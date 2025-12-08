import type { Root } from 'mdast';
import { htmlPairPass } from './htmlpair';
import { normalizePass, mergePass, optimizePass } from './std';

/**
 * 执行多遍处理
 */
export function multiPass(tree: Root): Root {
    let result = tree;

    // 第一遍：标准化
    result = normalizePass(result);

    // 第二遍：合并
    result = mergePass(result);

    // 第三遍：优化
    result = optimizePass(result);

    // 第四遍：HTML配对处理
    result = htmlPairPass(result);

    return result;
}
