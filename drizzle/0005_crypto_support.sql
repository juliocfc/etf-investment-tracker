CREATE TABLE `cryptoholdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`portfolioId` integer NOT NULL,
	`accountId` integer DEFAULT 0 NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`quantity` text NOT NULL,
	`purchasePrice` text NOT NULL,
	`currentPrice` text NOT NULL,
	`desiredAllocation` text DEFAULT '0' NOT NULL,
	`purchaseDate` integer NOT NULL,
	`lastPriceUpdate` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cryptopurchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`portfolioId` integer NOT NULL,
	`accountId` integer DEFAULT 0 NOT NULL,
	`holdingId` integer NOT NULL,
	`symbol` text NOT NULL,
	`quantity` text NOT NULL,
	`price` text NOT NULL,
	`fees` text DEFAULT '0' NOT NULL,
	`cashTransactionId` integer,
	`purchaseDate` integer NOT NULL,
	`isSold` integer DEFAULT false,
	`soldDate` integer,
	`soldPrice` text,
	`createdAt` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
