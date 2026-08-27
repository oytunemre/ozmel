-- 022_tasks.sql — gorevler (v1'deki DB.gorevler, ~42 kayit) + gorev kisileri
-- (DB.gorevKisiler, 4 kayit)
--
-- gorevKisiler PAYLASIMLI KISI DIZINIDIR (isim/eposta/telefon) — goreve bagli cocuk
-- degil, bagimsiz tablo. gorevler onu anaSorumlu/yardimci ile ISIM olarak referans
-- ediyordu; burada primary/secondary_assignee_id ile FK. ETL'de isimden id'ye
-- eslenecek; eslesmeyen isim cikabilecegi icin FK'ler NULL (ON DELETE SET NULL).
--
-- task_people ONCE gelir — tasks ona FK verir.
--
-- completion_ratio: v1'de 0–1 arasi KESIR (1 = %100), yuzde degil -> DECIMAL(5,4).
--
-- Ortak sutunlar (iki tabloda): id, tenant_id, legacy_id, created_at, updated_at,
-- created_by, updated_by. legacy_id yalnizca v1 tasima icin.

CREATE TABLE IF NOT EXISTS task_people (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id  VARCHAR(64)     NULL,
  name       VARCHAR(255)    NOT NULL,
  email      VARCHAR(255)    NULL,
  phone      VARCHAR(64)     NULL,
  created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by INT UNSIGNED    NULL,
  updated_by INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  -- Ayni firmada ayni isim iki kez olmasin (isimle ETL eslemesi buna dayanir).
  UNIQUE KEY uniq_tperson_tenant_name   (tenant_id, name),
  UNIQUE KEY uniq_tperson_tenant_legacy (tenant_id, legacy_id),
  KEY idx_tperson_tenant (tenant_id),
  CONSTRAINT fk_tperson_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             INT UNSIGNED    NOT NULL DEFAULT 1,
  legacy_id             VARCHAR(64)     NULL,
  sequence              INT             NULL,
  description           TEXT            NOT NULL,
  department            VARCHAR(128)    NULL,
  primary_assignee_id   BIGINT UNSIGNED NULL,
  secondary_assignee_id BIGINT UNSIGNED NULL,
  priority              VARCHAR(32)     NULL,
  due_date              DATE            NULL,
  status                VARCHAR(32)     NULL,
  -- 0–1 arasi kesir (1 = %100), yuzde degil.
  completion_ratio      DECIMAL(5,4)    NULL,
  notes                 TEXT            NULL,
  created_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  created_by            INT UNSIGNED    NULL,
  updated_by            INT UNSIGNED    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_task_tenant_legacy (tenant_id, legacy_id),
  KEY idx_task_tenant    (tenant_id),
  KEY idx_task_primary   (primary_assignee_id),
  KEY idx_task_secondary (secondary_assignee_id),
  CONSTRAINT fk_task_tenant    FOREIGN KEY (tenant_id)             REFERENCES tenants        (id),
  -- Kisi silinirse gorev kalir, atama bagi kopar (isim eslesmesi kaybolabilir).
  CONSTRAINT fk_task_primary   FOREIGN KEY (primary_assignee_id)   REFERENCES task_people (id) ON DELETE SET NULL,
  CONSTRAINT fk_task_secondary FOREIGN KEY (secondary_assignee_id) REFERENCES task_people (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('022_tasks');
