CREATE TABLE "finance_accounts" (
	"id" text PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"recovery_identity_id" text UNIQUE,
	"recovery_email" text,
	"pending_identity_id" text,
	"pending_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_auth_limits" (
	"id" text PRIMARY KEY,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL
);
