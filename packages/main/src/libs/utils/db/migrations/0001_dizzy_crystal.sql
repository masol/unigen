CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`is_error` integer DEFAULT false NOT NULL,
	`agent` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_session_id` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_timestamp` ON `messages` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_messages_session_ts` ON `messages` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_manual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_updated_at` ON `sessions` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_last_message_at` ON `sessions` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text,
	`detail` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT 0 NOT NULL,
	`extra` text,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_traces_message_id` ON `traces` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_message_parent` ON `traces` (`message_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_traces_message_created` ON `traces` (`message_id`,`created_at`);