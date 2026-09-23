ALTER TABLE `videos` ADD `thumbnailKey` varchar(512);--> statement-breakpoint
ALTER TABLE `videos` ADD `thumbnailUrl` varchar(768);--> statement-breakpoint
ALTER TABLE `videos` ADD `thumbnailMimeType` varchar(128);--> statement-breakpoint
ALTER TABLE `videos` ADD `thumbnailSizeBytes` bigint;