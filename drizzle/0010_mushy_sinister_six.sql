CREATE TABLE `draw_resolutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`official_results_json` text NOT NULL,
	`discarded_json` text NOT NULL,
	`position_used` integer,
	`official_result_used` integer,
	`winner_number` integer,
	`winner_was_sold` integer,
	`status` text NOT NULL,
	`unclaimed_policy` text NOT NULL,
	`formula` text,
	`correction_of` integer,
	`correction_reason` text,
	`resolved_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `draw_resolution_method` text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_lottery_name` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_draw_name` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_draw_date` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_draw_url` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_result_count` integer DEFAULT 20;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `official_result_digits` integer DEFAULT 4;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `mapping_number_count` integer;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `mapping_start_number` integer;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `mapping_result_space` integer DEFAULT 10000;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `mapping_valid_result_limit` integer;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `draw_resolution_note` text DEFAULT 'Se toma la primera posición válida del extracto oficial.' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `unclaimed_winner_policy` text DEFAULT 'no_winner' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `show_winner_buyer_name` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `roster_closed_at` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `roster_hash` text;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `roster_sold_count` integer;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `active_draw_resolution_id` integer;