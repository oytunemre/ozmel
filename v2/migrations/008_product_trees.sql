-- 008_product_trees.sql — urun agaclari (v1'deki DB.urunAgaclari)
--
-- v1'de urunAgaclari OZ-REFERANSLI bir agacti: parentId -> urunAgaclari.id.
-- Dugumun urunu `kod` (serbest metin -> kodTanimlari.kod) ile, kullandigi
-- hammadde `malzemeKodu` (yine serbest metin) ile gosteriliyordu. Burada ikisi de
-- product_codes'a FK (id) ile baglanir — serbest metin degil.
--   kod          -> product_code_id  (dugumun kendi urunu)
--   malzemeKodu  -> material_code_id  (kullanilan hammadde; orada type='Hammadde')
--
-- Silme: bir dugum silinince alt agaci da gider (parent_id self-FK ON DELETE CASCADE).
-- Dugum kendi kendine parent OLAMAZ — Validator engeller (FK bunu yakalamaz).
--
-- v1'de disCap/icCap/... float|null idi; burada DECIMAL(12,3) NULL.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS product_trees (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id             VARCHAR(64)     NULL,
  parent_id             BIGINT UNSIGNED NULL,
  product_code_id       BIGINT UNSIGNED NOT NULL,
  material_code_id      BIGINT UNSIGNED NULL,
  material_description  VARCHAR(255)    NULL,
  description           VARCHAR(255)    NULL,
  revision              VARCHAR(32)     NULL,
  revision_date         DATE            NULL,
  -- v1: float|null (birimMiktar vars. 1, kesimKaybi vars. 5) — varsayilanlar Validator/DTO'da degil,
  -- istemci gonderir; sema NULL kabul eder.
  unit_quantity         DECIMAL(12,3)   NULL,
  outer_diameter        DECIMAL(12,3)   NULL,
  inner_diameter        DECIMAL(12,3)   NULL,
  material_length       DECIMAL(12,3)   NULL,
  material_weight       DECIMAL(12,3)   NULL,
  part_length           DECIMAL(12,3)   NULL,
  cut_loss              DECIMAL(12,3)   NULL,
  supplier_cut_length   DECIMAL(12,3)   NULL,
  created_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by            INT UNSIGNED    NULL,
  updated_by            INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_ptree_tenant_legacy (tenant_id, legacy_id),
  KEY idx_ptree_tenant   (tenant_id),
  KEY idx_ptree_parent   (parent_id),
  KEY idx_ptree_product  (product_code_id),
  KEY idx_ptree_material (material_code_id),
  CONSTRAINT fk_ptree_tenant   FOREIGN KEY (tenant_id)        REFERENCES tenants          (id),
  -- Alt dugumler ust silinince gider.
  CONSTRAINT fk_ptree_parent   FOREIGN KEY (parent_id)        REFERENCES product_trees (id) ON DELETE CASCADE,
  -- Kullanimda olan kod tanimi silinemez (RESTRICT — varsayilan).
  CONSTRAINT fk_ptree_product  FOREIGN KEY (product_code_id)  REFERENCES product_codes (id),
  -- Hammadde kodu silinirse baglanti kopar (NULL).
  CONSTRAINT fk_ptree_material FOREIGN KEY (material_code_id) REFERENCES product_codes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('008_product_trees');
