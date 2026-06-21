import { defineConfig } from 'drizzle-kit';

// 确保在读取 process.env 之前加载了环境变量（如果使用的是 Next.js / Vite，它们会自动加载）
// 如果是独立的 Node.js 脚本，请先安装并取消注释下一行：
// import 'dotenv/config'; 

export default defineConfig({
    dialect: 'sqlite',

    // 2. 您的 TypeScript Schema 文件或目录路径
    schema: './packages/main/src/libs/utils/db/schema/index.ts',

    // 3. 自动生成的 SQL 迁移文件存放目录
    out: './packages/main/src/libs/utils/db/migrations',

    // 5. 最佳实践安全配置
    breakpoints: true,  // 在生成的 SQL 语句之间添加断点，防止合并执行时出错
    strict: true,       // 开启严格模式，执行迁移时会提示确认，防止意外覆盖数据库
    verbose: true,      // 打印详细的日志，方便在控制台排查生成或推送时的问题
});
