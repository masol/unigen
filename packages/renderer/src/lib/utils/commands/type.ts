
export type CommandHandler = () => void | Promise<void>;

export interface CommandDescriptor {
    id: string;
    label: string;
    category?: string;
    description?: string;
    handler: CommandHandler;
}
