import type { IFuseOptions } from 'fuse.js';
import Fuse from 'fuse.js';
import { pinyin } from 'pinyin-pro';

export interface SearchItem {
    id: string | number;
    text: string;
}

interface ProcessedItem extends SearchItem {
    _fullPinyin: string;
    _firstLetters: string;
}

export class PinyinFuseSearch {
    private fuse: Fuse<ProcessedItem>;

    constructor(dataArray: SearchItem[], options: IFuseOptions<ProcessedItem> = {}) {
        if (!Array.isArray(dataArray)) {
            throw new TypeError('传入的数据必须是一个数组');
        }

        const processedData: ProcessedItem[] = dataArray.map(item => {
            const fullPinyin = pinyin(item.text, { toneType: 'none', separator: '' });
            const firstLetters = pinyin(item.text, {
                pattern: 'first',
                toneType: 'none',
                separator: '',
            });

            return {
                id: item.id,
                text: item.text,
                _fullPinyin: fullPinyin,
                _firstLetters: firstLetters,
            };
        });

        const defaultOptions: IFuseOptions<ProcessedItem> = {
            keys: [
                { name: 'text', weight: 1.0 },
                { name: '_fullPinyin', weight: 0.5 },
                { name: '_firstLetters', weight: 0.3 },
            ],
            threshold: 0.3,
            includeScore: true,
            shouldSort: true,
            ignoreLocation: true,
        };

        const finalOptions: IFuseOptions<ProcessedItem> = { ...defaultOptions, ...options };
        this.fuse = new Fuse(processedData, finalOptions);
    }

    /**
     * 执行搜索，返回按相关度排序的 id 列表
     * @param query - 搜索关键词
     * @returns 匹配的 id 数组
     */
    search(query: string): Array<string | number> {
        if (!query || !query.trim()) {
            return [];
        }
        return this.fuse.search(query.trim()).map(result => result.item.id);
    }
}