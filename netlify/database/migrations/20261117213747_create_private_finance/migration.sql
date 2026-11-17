CREATE TABLE "finance_challenges" (
	"id" text PRIMARY KEY,
	"owner" text,
	"challenge" text NOT NULL,
	"kind" text NOT NULL,
	"origin" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_credentials" (
	"id" text PRIMARY KEY,
	"owner" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint NOT NULL,
	"transports" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" text PRIMARY KEY,
	"owner" text NOT NULL,
	"pocket_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"occurrence" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_pockets" (
	"id" text PRIMARY KEY,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target" bigint NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"contribution" bigint NOT NULL,
	"frequency" text NOT NULL,
	"first_date" text NOT NULL,
	"next_index" integer DEFAULT 0 NOT NULL,
	"cycle" text NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_sessions" (
	"id" text PRIMARY KEY,
	"owner" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "finance_occurrence_unique" ON "finance_entries" ("pocket_id","occurrence");--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_pocket_id_finance_pockets_id_fkey" FOREIGN KEY ("pocket_id") REFERENCES "finance_pockets"("id") ON DELETE CASCADE;