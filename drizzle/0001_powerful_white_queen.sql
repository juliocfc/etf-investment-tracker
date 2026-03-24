CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`portfolioId` integer NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assetPrices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`price` text NOT NULL,
	`date` integer NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `symbol_date_idx` ON `assetPrices` (`symbol`,`date`);--> statement-breakpoint
CREATE TABLE `cashBalanceHistory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`portfolioId` integer NOT NULL,
	`accountId` integer NOT NULL,
	`amount` text NOT NULL,
	`transactionType` text,
	`transactionAmount` text,
	`description` text,
	`date` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `balanceHistory` ADD `date` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `cashBalance` ADD `accountId` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `etfHoldings` ADD `accountId` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `etfHoldings` ADD `desiredAllocation` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `priceHistory` ADD `date` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `accountId` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `fees` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `cashTransactionId` integer;--> statement-breakpoint
ALTER TABLE `purchases` ADD `isSold` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `purchases` ADD `soldDate` integer;