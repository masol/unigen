
export interface NavItem {
    id: string;
    icon: any;
    label: string;
    disabled: boolean;
    onClick?: () => void;
}

export interface Props {
    topItems?: NavItem[];
    bottomItems?: NavItem[];
    density?: 'compact' | 'comfortable' | 'spacious';
}


export const densityConfig = {
    compact: {
        width: '2.5rem', // 40px
        gap: 'gap-1',
        padding: 'py-2 px-1',
        itemSize: 'h-8 w-8'
    },
    comfortable: {
        width: '3rem', // 48px
        gap: 'gap-2',
        padding: 'py-3 px-1.5',
        itemSize: 'h-10 w-10'
    },
    spacious: {
        width: '3.5rem', // 56px
        gap: 'gap-3',
        padding: 'py-4 px-2',
        itemSize: 'h-12 w-12'
    }
};