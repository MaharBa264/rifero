CREATE TABLE `idempotency_keys` (
	`id_key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identity` text NOT NULL,
	`ip` text NOT NULL,
	`success` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_login_attempts_identity` ON `login_attempts` (`identity`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_login_attempts_ip` ON `login_attempts` (`ip`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` integer,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`revoked_at` text,
	`user_agent` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_subject` ON `sessions` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_type` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `actor_id` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `entity_type` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `entity_id` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `before_json` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `after_json` text;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `sellers` ADD `deleted_at` text;