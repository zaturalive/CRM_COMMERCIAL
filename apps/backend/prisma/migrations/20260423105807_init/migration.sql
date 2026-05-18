-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COMMERCIAL', 'CHIRURGIEN');

-- CreateEnum
CREATE TYPE "ProcessStage" AS ENUM ('CONTACT', 'CONSULTATION', 'POST_CONSULT', 'CONFIRMEE', 'OP_PROGRAMMEE', 'EFFECTUEE', 'NON_QUALIFIE', 'FOLLOWUP', 'ANNULEE');

-- CreateEnum
CREATE TYPE "FollowupReason" AS ENUM ('TEMPS', 'ARGENT', 'HESITATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('EN_ATTENTE', 'RECU', 'VALIDE');

-- CreateEnum
CREATE TYPE "DevisStatus" AS ENUM ('BROUILLON', 'TECHNIQUE_REMPLI', 'COMMERCIAL_REMPLI', 'ENVOYE', 'SIGNE', 'REFUSE');

-- CreateEnum
CREATE TYPE "HospitalisationMode" AS ENUM ('AMBULATOIRE', 'NUIT');

-- CreateEnum
CREATE TYPE "SourceAcquisition" AS ENUM ('BOUCHE_A_OREILLE', 'INSTAGRAM', 'TIKTOK', 'SITE_WEB', 'DOCTOLIB', 'RECOMMANDATION', 'AUTRE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "address" TEXT,
    "source" "SourceAcquisition",
    "doctolibUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Process" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "stage" "ProcessStage" NOT NULL DEFAULT 'CONTACT',
    "isQualified" BOOLEAN,
    "qualificationReason" TEXT,
    "qualificationIntensity" INTEGER,
    "nonQualifieReason" TEXT,
    "followupReason" "FollowupReason",
    "followupReasonDetail" TEXT,
    "consultationDate" TIMESTAMP(3),
    "budget" INTEGER,
    "noteCommerciale" TEXT,
    "noteMedecin" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Process_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessIntervention" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessIntervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "priceHonoraires" INTEGER NOT NULL,
    "marginCoeff" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionFee" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultPrice" INTEGER NOT NULL,
    "defaultQuantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterventionFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLabel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRequiredByDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionDocumentLabel" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "documentLabelId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionDocumentLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinique" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "fraisAmbulatoire" INTEGER NOT NULL,
    "fraisHospitalisationParNuit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CliniqueTarif" (
    "id" TEXT NOT NULL,
    "cliniqueId" TEXT NOT NULL,
    "dureeMin" INTEGER NOT NULL,
    "dureeMax" INTEGER NOT NULL,
    "fraisBloc" INTEGER NOT NULL,
    "fraisAnesthesie" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CliniqueTarif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CliniqueOption" (
    "id" TEXT NOT NULL,
    "cliniqueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "defaultPrice" INTEGER NOT NULL,
    "defaultQuantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CliniqueOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "DevisStatus" NOT NULL DEFAULT 'BROUILLON',
    "firstSignedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acomptePaidAt" TIMESTAMP(3),
    "soldePaidAmount" INTEGER NOT NULL DEFAULT 0,
    "totalCached" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisIntervention" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "priceHonoraires" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "cliniqueId" TEXT,
    "dateIntervention" TIMESTAMP(3),
    "timeIntervention" TIME,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevisIntervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisInterventionFee" (
    "id" TEXT NOT NULL,
    "devisInterventionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevisInterventionFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisOption" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "cliniqueOptionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "stayKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevisOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisCustomOption" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevisCustomOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisStay" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "cliniqueId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mode" "HospitalisationMode" NOT NULL DEFAULT 'AMBULATOIRE',
    "nightCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevisStay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessDocument" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "documentLabelId" TEXT,
    "name" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "fileUrl" TEXT,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Client_tenantId_phone_idx" ON "Client"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Client_tenantId_email_idx" ON "Client"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Process_tenantId_stage_isArchived_idx" ON "Process"("tenantId", "stage", "isArchived");

-- CreateIndex
CREATE INDEX "Process_clientId_idx" ON "Process"("clientId");

-- CreateIndex
CREATE INDEX "ProcessIntervention_processId_idx" ON "ProcessIntervention"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessIntervention_processId_interventionId_key" ON "ProcessIntervention"("processId", "interventionId");

-- CreateIndex
CREATE INDEX "Intervention_tenantId_isActive_idx" ON "Intervention"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "InterventionFee_interventionId_order_idx" ON "InterventionFee"("interventionId", "order");

-- CreateIndex
CREATE INDEX "DocumentLabel_tenantId_idx" ON "DocumentLabel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLabel_tenantId_name_key" ON "DocumentLabel"("tenantId", "name");

-- CreateIndex
CREATE INDEX "InterventionDocumentLabel_interventionId_order_idx" ON "InterventionDocumentLabel"("interventionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionDocumentLabel_interventionId_documentLabelId_key" ON "InterventionDocumentLabel"("interventionId", "documentLabelId");

-- CreateIndex
CREATE INDEX "Clinique_tenantId_idx" ON "Clinique"("tenantId");

-- CreateIndex
CREATE INDEX "CliniqueTarif_cliniqueId_idx" ON "CliniqueTarif"("cliniqueId");

-- CreateIndex
CREATE INDEX "CliniqueOption_cliniqueId_order_idx" ON "CliniqueOption"("cliniqueId", "order");

-- CreateIndex
CREATE INDEX "Devis_processId_idx" ON "Devis"("processId");

-- CreateIndex
CREATE INDEX "Devis_tenantId_status_idx" ON "Devis"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Devis_tenantId_reference_key" ON "Devis"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "DevisIntervention_devisId_idx" ON "DevisIntervention"("devisId");

-- CreateIndex
CREATE INDEX "DevisIntervention_cliniqueId_dateIntervention_idx" ON "DevisIntervention"("cliniqueId", "dateIntervention");

-- CreateIndex
CREATE INDEX "DevisInterventionFee_devisInterventionId_order_idx" ON "DevisInterventionFee"("devisInterventionId", "order");

-- CreateIndex
CREATE INDEX "DevisOption_devisId_idx" ON "DevisOption"("devisId");

-- CreateIndex
CREATE INDEX "DevisOption_stayKey_idx" ON "DevisOption"("stayKey");

-- CreateIndex
CREATE INDEX "DevisCustomOption_devisId_idx" ON "DevisCustomOption"("devisId");

-- CreateIndex
CREATE INDEX "DevisStay_cliniqueId_date_idx" ON "DevisStay"("cliniqueId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DevisStay_devisId_cliniqueId_date_key" ON "DevisStay"("devisId", "cliniqueId", "date");

-- CreateIndex
CREATE INDEX "ProcessDocument_processId_idx" ON "ProcessDocument"("processId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessIntervention" ADD CONSTRAINT "ProcessIntervention_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessIntervention" ADD CONSTRAINT "ProcessIntervention_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionFee" ADD CONSTRAINT "InterventionFee_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLabel" ADD CONSTRAINT "DocumentLabel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionDocumentLabel" ADD CONSTRAINT "InterventionDocumentLabel_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionDocumentLabel" ADD CONSTRAINT "InterventionDocumentLabel_documentLabelId_fkey" FOREIGN KEY ("documentLabelId") REFERENCES "DocumentLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinique" ADD CONSTRAINT "Clinique_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliniqueTarif" ADD CONSTRAINT "CliniqueTarif_cliniqueId_fkey" FOREIGN KEY ("cliniqueId") REFERENCES "Clinique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CliniqueOption" ADD CONSTRAINT "CliniqueOption_cliniqueId_fkey" FOREIGN KEY ("cliniqueId") REFERENCES "Clinique"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisIntervention" ADD CONSTRAINT "DevisIntervention_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisIntervention" ADD CONSTRAINT "DevisIntervention_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisIntervention" ADD CONSTRAINT "DevisIntervention_cliniqueId_fkey" FOREIGN KEY ("cliniqueId") REFERENCES "Clinique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisInterventionFee" ADD CONSTRAINT "DevisInterventionFee_devisInterventionId_fkey" FOREIGN KEY ("devisInterventionId") REFERENCES "DevisIntervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisOption" ADD CONSTRAINT "DevisOption_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisOption" ADD CONSTRAINT "DevisOption_cliniqueOptionId_fkey" FOREIGN KEY ("cliniqueOptionId") REFERENCES "CliniqueOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisCustomOption" ADD CONSTRAINT "DevisCustomOption_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisStay" ADD CONSTRAINT "DevisStay_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisStay" ADD CONSTRAINT "DevisStay_cliniqueId_fkey" FOREIGN KEY ("cliniqueId") REFERENCES "Clinique"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocument" ADD CONSTRAINT "ProcessDocument_processId_fkey" FOREIGN KEY ("processId") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessDocument" ADD CONSTRAINT "ProcessDocument_documentLabelId_fkey" FOREIGN KEY ("documentLabelId") REFERENCES "DocumentLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
