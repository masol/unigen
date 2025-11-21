export interface CMWrapperOptions {
    parent: HTMLElement;
    initialValue?: string;
    placeholder?: string;
    readonly?: boolean;
    onChange?: (content: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
}

export type MenuCommand =
    | 'bold'
    | 'italic'
    | 'strikethrough'
    | 'code'
    | 'code-block'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'heading5'
    | 'heading6'
    | 'quote'
    | 'list'
    | 'numbered-list'
    | 'task-list'
    | 'link'
    | 'image'
    | 'table'
    | 'horizontal-rule'
    | 'cut'
    | 'copy'
    | 'paste'
    | 'delete'
    | 'select-all';