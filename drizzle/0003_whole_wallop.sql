ALTER TABLE `raffle_settings` ADD `hero_title` text DEFAULT 'Ayudanos a hacer algo enorme.' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `hero_intro` text DEFAULT 'Cada número suma. Elegí el tuyo con una familia vendedora y guardá el comprobante para el sorteo.' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `logo_image_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `hero_image_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `font_family` text DEFAULT 'Trebuchet MS' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `primary_color` text DEFAULT '#6d28d9' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `secondary_color` text DEFAULT '#ec4899' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `accent_color` text DEFAULT '#fbbf24' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `background_color` text DEFAULT '#fff8ed' NOT NULL;--> statement-breakpoint
ALTER TABLE `raffle_settings` ADD `text_color` text DEFAULT '#2e1557' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `limit_mode` text DEFAULT 'count' NOT NULL;--> statement-breakpoint
ALTER TABLE `sellers` ADD `limit_from` integer;--> statement-breakpoint
ALTER TABLE `sellers` ADD `limit_to` integer;--> statement-breakpoint
ALTER TABLE `sellers` ADD `limit_count` integer DEFAULT 15 NOT NULL;