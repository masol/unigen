import { isPlainObject } from "radashi";


export type PrjTimeStore<T> = { value: T, updatedAt: string | null }

export function isPrjtimeStore<T>(value: unknown): value is PrjTimeStore<T> {
    return isPlainObject(value) && "value" in value && "updatedAt" in value;
}