ALTER TABLE "dubbing_logs" ADD COLUMN "model" varchar(100);--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "used_ai" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "ai_input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "ai_output_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "ai_cached_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "ai_cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "audio_duration" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dubbing_logs" ADD COLUMN "completed_at" timestamp;