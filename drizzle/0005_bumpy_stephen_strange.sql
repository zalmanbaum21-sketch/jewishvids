CREATE TABLE `video_upload_chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` varchar(64) NOT NULL,
	`chunkIndex` int NOT NULL,
	`sizeBytes` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_upload_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `video_upload_chunks_storageKey_unique` UNIQUE(`storageKey`),
	CONSTRAINT `video_upload_chunks_upload_idx` UNIQUE(`uploadId`,`chunkIndex`)
);
--> statement-breakpoint
CREATE TABLE `video_upload_sessions` (
	`id` varchar(64) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` bigint NOT NULL,
	`totalChunks` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `video_upload_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `video_upload_chunks_upload_id_idx` ON `video_upload_chunks` (`uploadId`);--> statement-breakpoint
CREATE INDEX `video_upload_sessions_created_at_idx` ON `video_upload_sessions` (`createdAt`);