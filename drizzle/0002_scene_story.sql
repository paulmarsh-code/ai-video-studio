ALTER TABLE `scenes` ADD `cast` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `story` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `scenes` ADD `target_sec` integer DEFAULT 60 NOT NULL;