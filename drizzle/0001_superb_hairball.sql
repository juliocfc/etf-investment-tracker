CREATE TABLE `balance_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalValue` decimal(18,8) NOT NULL,
	`cashValue` decimal(18,8) NOT NULL,
	`investmentValue` decimal(18,8) NOT NULL,
	`date` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `balance_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cash_balance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` decimal(18,8) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_balance_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_balance_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `dividend_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`dividendPerShare` decimal(18,8) NOT NULL,
	`exDate` timestamp NOT NULL,
	`paymentDate` timestamp,
	`totalDividend` decimal(18,8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dividend_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `etf_holdings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`name` varchar(255) NOT NULL,
	`quantity` decimal(18,8) NOT NULL,
	`purchasePrice` decimal(18,8) NOT NULL,
	`purchaseDate` timestamp NOT NULL,
	`currentPrice` decimal(18,8),
	`lastPriceUpdate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `etf_holdings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`price` decimal(18,8) NOT NULL,
	`date` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `balance_history` ADD CONSTRAINT `balance_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_balance` ADD CONSTRAINT `cash_balance_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dividend_history` ADD CONSTRAINT `dividend_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `etf_holdings` ADD CONSTRAINT `etf_holdings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_userId_date` ON `balance_history` (`userId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_userId_symbol` ON `dividend_history` (`userId`,`symbol`);--> statement-breakpoint
CREATE INDEX `idx_userId` ON `etf_holdings` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_symbol` ON `etf_holdings` (`symbol`);--> statement-breakpoint
CREATE INDEX `idx_userId_symbol_date` ON `price_history` (`userId`,`symbol`,`date`);