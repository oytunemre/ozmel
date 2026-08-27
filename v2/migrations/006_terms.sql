-- 006_terms.sql — terim cevirileri (v1'deki DB.terimCevirileri + DB.gizliTerimler)
--
-- v1'de IKI ayri yapi vardi:
--   terimCevirileri: {id, orijinal(benzersiz), ceviri}
--   gizliTerimler:   DUZ STRING DIZISI — her eleman terimCevirileri.orijinal ile eslesir
-- Yani "gizli mi" aslinda terimin bir OZELLIGI; ayri tablo/dizi olarak tutulmasi
-- yapisal uyumsuzluk. Burada tek tabloda `is_hidden` BOOLEAN sutunu olur.
--
-- Ortak sutunlar: id, tenant_id, legacy_id, created_at, updated_at, created_by,
-- updated_by. legacy_id yalnizca v1 tasima icin; API'den yazilmaz (Repository
-- whitelist'inde yoktur).

CREATE TABLE IF NOT EXISTS terms (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id   VARCHAR(64)     NULL,
  original    VARCHAR(255)    NOT NULL,
  translation VARCHAR(255)    NULL,
  is_hidden   TINYINT(1)      NOT NULL DEFAULT 0,
  created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by  INT UNSIGNED    NULL,
  updated_by  INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Ayni firmada ayni orijinal terim iki kez olamaz.
  UNIQUE KEY uniq_term_tenant_original (tenant_id, original),
  UNIQUE KEY uniq_term_tenant_legacy   (tenant_id, legacy_id),
  KEY idx_term_tenant (tenant_id),
  CONSTRAINT fk_term_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('006_terms');
