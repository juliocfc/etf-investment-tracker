CREATE TABLE `portfolios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cash_balance` DROP INDEX `cash_balance_userId_unique`;--> statement-breakpoint
DROP INDEX `idx_userId_date` ON `balance_history`;--> statement-breakpoint
DROP INDEX `idx_userId_holdingId` ON `purchases`;--> statement-breakpoint
ALTER TABLE `balance_history` ADD `portfolioId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_balance` ADD `portfolioId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `etf_holdings` ADD `portfolioId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `portfolioId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_userId` ON `portfolios` (`userId`);--> statement-breakpoint
ALTER TABLE `balance_history` ADD CONSTRAINT `balance_history_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_balance` ADD CONSTRAINT `cash_balance_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `etf_holdings` ADD CONSTRAINT `etf_holdings_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_userId_portfolioId_date` ON `balance_history` (`userId`,`portfolioId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_userId_portfolioId` ON `cash_balance` (`userId`,`portfolioId`);--> statement-breakpoint
CREATE INDEX `idx_portfolioId` ON `etf_holdings` (`portfolioId`);--> statement-breakpoint
CREATE INDEX `idx_userId_portfolioId_holdingId` ON `purchases` (`userId`,`portfolioId`,`holdingId`);