import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '$libs/utils/db/schema/index.js'
export type DrizzleDBType = BetterSQLite3Database<typeof schema>;