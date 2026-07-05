export * from './kvstore.js'
// 直接复用kvstore.不再维护依赖关系。规定运行期的frame key以"#"开头。并且不再维护workflowid的映射，如果需要多个，需要节点自己扁平化到key中。
export * from './capability.js'
export * from './metag.js'
