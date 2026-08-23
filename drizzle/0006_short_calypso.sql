DROP INDEX "ai_model_usage_subscription_period_model_unique";--> statement-breakpoint
ALTER TABLE "ai_model_usage" ALTER COLUMN "subscription_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_usage_user_period_model_unique" ON "ai_model_usage" USING btree ("user_id","period_start","model");