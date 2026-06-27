CREATE TABLE `kv_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value` blob NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `exec_frame` (
	`key` text NOT NULL,
	`value` blob NOT NULL,
	`wf_version` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deps` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`wf_version`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idx_execframe_wf_version` ON `exec_frame` (`wf_version`);--> statement-breakpoint
CREATE INDEX `idx_execframe_key` ON `exec_frame` (`key`);--> statement-breakpoint
CREATE INDEX `idx_execframe_version` ON `exec_frame` (`version`);