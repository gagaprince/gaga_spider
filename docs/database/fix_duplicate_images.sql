-- ============================================================
-- 修复 chapter_images 重复数据 & 添加唯一索引
-- 执行前请确认已连接到 gaga_spider 数据库
-- ============================================================

-- 1. 删除重复记录,每组 (chapter_id, order_index) 只保留 id 最小的一条
DELETE ci1 FROM chapter_images ci1
INNER JOIN chapter_images ci2
  ON ci1.chapter_id = ci2.chapter_id
  AND ci1.order_index = ci2.order_index
  AND ci1.id > ci2.id;

-- 2. 先添加唯一索引(以 chapter_id 开头,可被外键约束复用)
ALTER TABLE chapter_images ADD UNIQUE INDEX uk_chapter_order (chapter_id, order_index);

-- 3. 再删除旧的普通索引(外键约束会自动使用新的唯一索引)
ALTER TABLE chapter_images DROP INDEX idx_chapter_order;
