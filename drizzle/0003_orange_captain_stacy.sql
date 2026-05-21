CREATE TABLE `fiFullSimulationAssets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`symbol` text NOT NULL,
	`allocation` text DEFAULT '0' NOT NULL,
	`usagePercent` text DEFAULT '100' NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fiSimulationAssets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`symbol` text NOT NULL,
	`allocation` text DEFAULT '0' NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `etfHoldings` ADD `annualDividendPerShare` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `retirementWithdrawalRate` text;--> statement-breakpoint
ALTER TABLE `users` ADD `retirementReturnRate` text;--> statement-breakpoint
ALTER TABLE `users` ADD `retirementInflationRate` text;--> statement-breakpoint
ALTER TABLE `users` ADD `retirementStartDate` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `userBirthDate` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `ssAmount` text;--> statement-breakpoint
ALTER TABLE `users` ADD `ssAge` text;--> statement-breakpoint
ALTER TABLE `users` ADD `lifeExpectancy` text DEFAULT '85';--> statement-breakpoint
ALTER TABLE `users` ADD `targetEffortDate` integer;