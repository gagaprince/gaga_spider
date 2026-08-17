-- Manhwa18 等英文站的 slug 可能超过 100 字符（实测最长 114），
-- 将 resource_sources.source_id 加宽到 255。
ALTER TABLE resource_sources
  MODIFY COLUMN source_id VARCHAR(255) NULL COMMENT '源站内ID(英文站 slug 可能较长)';
