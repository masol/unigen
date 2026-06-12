export interface DialogComponentProps<T = unknown> {
    dialogId: string;
    isTopDialog: boolean;
    onClose: (data?: T) => void;
    onCancel: (reason?: unknown) => void;
}