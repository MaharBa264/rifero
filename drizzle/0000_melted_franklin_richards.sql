CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prizes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raffle_numbers` (
	`number` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`seller_id` integer,
	`buyer_name` text,
	`buyer_phone` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `raffle_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`school` text DEFAULT '6.º grado' NOT NULL,
	`price_cents` integer DEFAULT 300000 NOT NULL,
	`number_count` integer DEFAULT 100 NOT NULL,
	`draw_date` text,
	`draw_name` text DEFAULT 'Lotería de la Ciudad — Quiniela' NOT NULL,
	`official_url` text DEFAULT 'https://www.loteriadelaciudad.gob.ar/' NOT NULL,
	`result_number` text,
	`whatsapp_text` text DEFAULT '¡Gracias por colaborar con nuestra rifa!' NOT NULL,
	`admin_emails` text DEFAULT 'maharba264@gmail.com' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_name` text NOT NULL,
	`display_name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_child_name_unique` ON `sellers` (`child_name`);