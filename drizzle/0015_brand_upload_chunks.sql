CREATE TABLE "brand_upload_chunks" (
	"upload_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"idx" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_upload_chunks_upload_id_idx_pk" PRIMARY KEY("upload_id","idx")
);
