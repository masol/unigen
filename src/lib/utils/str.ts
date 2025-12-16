export function trimTo6(str: string) {
    if (!str) return '';
    return str.length > 9 ? str.slice(0, 9) + '…' : str;
}