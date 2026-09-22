CREATE INDEX `idx_raffle_numbers_active_status` ON `raffle_numbers` (`active`,`status`);--> statement-breakpoint
CREATE INDEX `idx_raffle_numbers_seller_id` ON `raffle_numbers` (`seller_id`);--> statement-breakpoint
PRAGMA optimize;
