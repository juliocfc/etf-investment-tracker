CREATE TABLE `brokerageHoldings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`accountId` text NOT NULL,
	`accountName` text,
	`accountNumber` text,
	`symbol` text,
	`units` text,
	`price` text,
	`averagePurchasePrice` text,
	`currency` text,
	`rawResponse` text NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `holdings_user_acc_sym_idx` ON `brokerageHoldings` (`userId`,`accountId`,`symbol`);--> statement-breakpoint
CREATE TABLE `brokerageSyncs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`lastSyncAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`lastHoldingsSyncAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_sync_idx` ON `brokerageSyncs` (`userId`);--> statement-breakpoint
CREATE TABLE `brokerageTransactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`externalId` text NOT NULL,
	`accountId` text NOT NULL,
	`type` text,
	`description` text,
	`symbol` text,
	`units` text,
	`price` text,
	`amount` text,
	`currency` text,
	`tradeDate` integer,
	`settlementDate` integer,
	`rawResponse` text NOT NULL,
	`importDate` integer,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `brokerageTransactions_externalId_unique` ON `brokerageTransactions` (`externalId`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`description` text NOT NULL,
	`amount` text NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `importedTransactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`externalId` text NOT NULL,
	`source` text NOT NULL,
	`importDate` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `external_id_source_idx` ON `importedTransactions` (`externalId`,`source`);--> statement-breakpoint
DROP INDEX `symbol_date_idx`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `accountType` text DEFAULT 'Brokerage' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `soldPrice` text;