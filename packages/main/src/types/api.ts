

export interface ApiContract {
    test: {
        test: (i: string) => Promise<string>
    }
}