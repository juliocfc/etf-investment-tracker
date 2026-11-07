CREATE TABLE `allocationGroups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`targetAllocation` text DEFAULT '0' NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `allocationGroupAssets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`groupId` integer NOT NULL,
	`userId` integer NOT NULL,
	`assetType` text NOT NULL,
	`assetKey` text NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `allocationGroups`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_asset_unique_idx` ON `allocationGroupAssets` (`groupId`,`assetType`,`assetKey`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_asset_unique_idx` ON `allocationGroupAssets` (`userId`,`assetType`,`assetKey`);
