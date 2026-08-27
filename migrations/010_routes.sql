-- 010_routes.sql — rotalar (v1'deki DB.routes, ~161 kayit)
--
-- v1'de her rota adimi {urun, urunAdi, operasyon, isMerkezi, sira, aktif,
-- varyantEtiketi, varyantSecenekleri[]} idi; urun/operasyon/isMerkezi SERBEST
-- METIN olarak tekrarlaniyordu (ad degisince drift). Burada hepsi id ile FK:
--   urun      -> product_code_id (product_codes)
--   operasyon -> operation_id    (operations)
--   isMerkezi -> work_center_id  (work_centers)
-- urunAdi ARTIK TUTULMAZ — product_code_id join'inden gelir (denormalizasyon yok).
--
-- varyantSecenekleri[] bir DIZIYDI -> cocuk tablo route_variants (bir satir bir
-- secenek). Operator yetkinlikleri desenindeki gibi: ana kayit + varyantlar tek
-- transaction'da yazilir, cocuk degisince ana kaydin damgasi touch() ile ilerler.
--
-- Ortak sutunlar (iki tabloda): id, tenant_id, legacy_id, created_at, updated_at,
-- created_by, updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz.

CREATE TABLE IF NOT EXISTS routes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id       INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id       VARCHAR(64)     NULL,
  product_code_id BIGINT UNSIGNED NOT NULL,
  operation_id    BIGINT UNSIGNED NOT NULL,
  work_center_id  BIGINT UNSIGNED NOT NULL,
  sequence        INT             NOT NULL DEFAULT 0,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  variant_label   VARCHAR(128)    NULL,
  created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by      INT UNSIGNED    NULL,
  updated_by      INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_route_tenant_legacy (tenant_id, legacy_id),
  KEY idx_route_tenant   (tenant_id),
  KEY idx_route_product  (product_code_id),
  KEY idx_route_operation (operation_id),
  KEY idx_route_wc       (work_center_id),
  CONSTRAINT fk_route_tenant    FOREIGN KEY (tenant_id)       REFERENCES tenants          (id),
  CONSTRAINT fk_route_product   FOREIGN KEY (product_code_id) REFERENCES product_codes (id),
  CONSTRAINT fk_route_operation FOREIGN KEY (operation_id)    REFERENCES operations    (id),
  CONSTRAINT fk_route_wc        FOREIGN KEY (work_center_id)  REFERENCES work_centers  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS route_variants (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  route_id   BIGINT UNSIGNED NOT NULL,
  value      VARCHAR(128)    NOT NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Ayni rotada ayni varyant secenegi iki kez olamaz.
  UNIQUE KEY uniq_rvariant_tenant_route_value (tenant_id, route_id, value),
  UNIQUE KEY uniq_rvariant_tenant_legacy      (tenant_id, legacy_id),
  KEY idx_rvariant_tenant (tenant_id),
  KEY idx_rvariant_route  (route_id),
  CONSTRAINT fk_rvariant_tenant FOREIGN KEY (tenant_id) REFERENCES tenants  (id),
  -- Rota silinince varyantlari da gider.
  CONSTRAINT fk_rvariant_route  FOREIGN KEY (route_id)  REFERENCES routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('010_routes');
