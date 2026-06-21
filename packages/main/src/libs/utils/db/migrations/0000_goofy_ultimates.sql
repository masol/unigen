CREATE TABLE `kv_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value` blob NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
