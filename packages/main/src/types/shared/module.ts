
export interface ModuleSource {
    code: string
    format: ModuleFormat
    version?: string // 如果请求的pluginId中未包含version,这里返回code对应的version.
}

export type ModuleFormat = 'cjs' | 'umd' | 'esm' | 'system'
