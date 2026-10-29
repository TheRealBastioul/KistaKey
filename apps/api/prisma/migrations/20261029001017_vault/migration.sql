-- CreateEnum
CREATE TYPE "item_type" AS ENUM ('login', 'note', 'totp');

-- CreateEnum
CREATE TYPE "vault_object_kind" AS ENUM ('item', 'folder');

-- CreateTable
CREATE TABLE "vault_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID,
    "type" "item_type" NOT NULL,
    "folder_id" UUID,
    "encrypted_key" TEXT NOT NULL,
    "encrypted_data" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "encrypted_name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_state" (
    "user_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "tombstone_floor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vault_state_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "vault_tombstones" (
    "user_id" UUID NOT NULL,
    "kind" "vault_object_kind" NOT NULL,
    "object_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "deleted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_tombstones_pkey" PRIMARY KEY ("user_id","kind","object_id")
);

-- CreateIndex
CREATE INDEX "vault_items_user_id_revision_idx" ON "vault_items"("user_id", "revision");

-- CreateIndex
CREATE INDEX "vault_items_folder_id_idx" ON "vault_items"("folder_id");

-- CreateIndex
CREATE INDEX "vault_items_deleted_at_idx" ON "vault_items"("deleted_at");

-- CreateIndex
CREATE INDEX "folders_user_id_revision_idx" ON "folders"("user_id", "revision");

-- CreateIndex
CREATE INDEX "vault_tombstones_user_id_revision_idx" ON "vault_tombstones"("user_id", "revision");

-- CreateIndex
CREATE INDEX "vault_tombstones_deleted_at_idx" ON "vault_tombstones"("deleted_at");

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_state" ADD CONSTRAINT "vault_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_tombstones" ADD CONSTRAINT "vault_tombstones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
