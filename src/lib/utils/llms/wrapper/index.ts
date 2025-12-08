// wrapper-factory.ts
import type { ILLMWrapper, LLMConfig, LLMTag } from '../index.type';
import { TextWrapper } from './text';

/**
 * 包装器工厂
 */
export class WrapperFactory {
    /**
     * 根据 tag 创建相应的包装器
     */
    static createWrapper(config: LLMConfig): ILLMWrapper {
        const tag = this.getModelTypeFromTag(config.tag);

        switch (tag) {
            case 'text':
                return new TextWrapper(config);
            case 'image':
                break;

        }

        throw new Error(`不支持的模型标签: ${tag}`);

        // // 图像类型
        // if (tag === 'image' || tag === 'image_modify') {
        //     return new ImageLLMWrapper(config);
        // }

        // // 视频类型
        // if (tag === 'video' || tag === 'video_modify') {
        //     return new VideoLLMWrapper(config);
        // }

        // // 音频类型
        // if (tag === 'speech' || tag === 'speech_modify' ||
        //     tag === 'music' || tag === 'music_modify') {
        //     return new AudioLLMWrapper(config);
        // }

    }

    /**
     * 获取标签对应的模型类型
     */
    static getModelTypeFromTag(tag: LLMTag): string {
        if (tag === 'fast' || tag === 'powerful' || tag === 'balanced') {
            return 'text';
        }
        if (tag === 'image' || tag === 'image_modify') {
            return 'image';
        }
        if (tag === 'video' || tag === 'video_modify') {
            return 'video';
        }
        if (tag === 'speech' || tag === 'speech_modify' ||
            tag === 'music' || tag === 'music_modify') {
            return 'audio';
        }
        throw new Error(`未知的标签: ${tag}`);
    }
}