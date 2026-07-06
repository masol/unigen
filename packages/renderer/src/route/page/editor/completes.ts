
/**
 * 客户端写死的 JS 代码提示器 —— 供 MonacoEditor 注册。
 */
export const JS_COMPLETIONS: {
    label: string;
    insertText: string;
    detail: string;
    documentation: string;
}[] = [
        {
            label: 'app.navigate',
            insertText: 'app.navigate("${1:/path}")',
            detail: '(method) app.navigate(path: string): void',
            documentation: '跳转到指定路由路径。'
        },
        {
            label: 'app.toast',
            insertText: 'app.toast("${1:message}")',
            detail: '(method) app.toast(message: string): void',
            documentation: '弹出一条全局提示消息。'
        },
        {
            label: 'app.getUser',
            insertText: 'app.getUser()',
            detail: '(method) app.getUser(): User',
            documentation: '获取当前登录用户对象。'
        },
        {
            label: 'db.query',
            insertText: 'db.query("${1:SQL}")',
            detail: '(method) db.query(sql: string): Promise<Row[]>',
            documentation: '执行一条 SQL 查询并返回结果集。'
        },
        {
            label: 'db.insert',
            insertText: 'db.insert("${1:table}", ${2:record})',
            detail: '(method) db.insert(table: string, record: object): Promise<void>',
            documentation: '向指定表插入一条记录。'
        },
        {
            label: 'util.formatDate',
            insertText: 'util.formatDate(${1:date}, "${2:YYYY-MM-DD}")',
            detail: '(method) util.formatDate(date: Date, fmt: string): string',
            documentation: '格式化日期为指定字符串。'
        },
        {
            label: 'util.uuid',
            insertText: 'util.uuid()',
            detail: '(method) util.uuid(): string',
            documentation: '生成一个随机 UUID。'
        }
    ];