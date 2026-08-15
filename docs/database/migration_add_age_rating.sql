-- ============================================================
-- Gaga Spider - 增加内容分级字段 (age_rating)
-- 在 resources 和 source_sites 表上增加 age_rating 字段
-- 默认值为 'all' (全年龄段), 可选 'adult' (成人限定)
-- 当前所有数据默认为全年龄段
-- ============================================================

ALTER TABLE resources
  ADD COLUMN age_rating ENUM('all','adult') NOT NULL DEFAULT 'all'
  COMMENT '内容分级: all=全年龄段, adult=成人限定'
  AFTER category;

ALTER TABLE source_sites
  ADD COLUMN age_rating ENUM('all','adult') NOT NULL DEFAULT 'all'
  COMMENT '内容分级: all=全年龄段, adult=成人限定'
  AFTER status;

-- 已有数据默认全年龄段,无需额外 UPDATE
