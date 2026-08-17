-- ============================================================
-- Gaga Spider - 数据库建表语句
-- 目标数据库: MySQL 8.0+ / MariaDB 10.5+ (支持 JSON、CHECK 约束)
-- 字符集: utf8mb4
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. source_sites - 源站配置
-- ============================================================
CREATE TABLE source_sites (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)   NOT NULL COMMENT '站点名称',
  domain        VARCHAR(255)   NOT NULL COMMENT '域名',
  resource_type ENUM('novel','comic') NOT NULL COMMENT '该站资源类型',
  config        JSON           NULL     COMMENT '抓取规则(选择器/URL模板/编码等)',
  rate_limit    INT            NOT NULL DEFAULT 1000 COMMENT '请求间隔(ms)',
  status        TINYINT        NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用',
  age_rating    ENUM('all','adult') NOT NULL DEFAULT 'all' COMMENT '内容分级: all=全年龄段, adult=成人限定',
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='源站配置';

-- ============================================================
-- 2. resources - 资源主表
-- ============================================================
CREATE TABLE resources (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  type             ENUM('novel','comic') NOT NULL COMMENT '资源类型',
  title            VARCHAR(255)   NOT NULL COMMENT '标题',
  summary          TEXT           NULL     COMMENT '简介',
  cover_url        VARCHAR(500)   NULL     COMMENT '封面远程URL',
  local_cover_path VARCHAR(500)   NULL     COMMENT '封面本地路径',
  status           VARCHAR(20)    NOT NULL DEFAULT 'unknown' COMMENT 'ongoing/completed/unknown',
  language         VARCHAR(20)    NOT NULL DEFAULT 'zh' COMMENT '语言',
  release_year     SMALLINT       NULL     COMMENT '发布年份',
  rating           DECIMAL(3,1)   NULL     COMMENT '评分',
  word_count       INT            NOT NULL DEFAULT 0 COMMENT '总字数(小说)',
  chapter_count    INT            NOT NULL DEFAULT 0 COMMENT '总章节数',
  is_complete      TINYINT        NOT NULL DEFAULT 0 COMMENT '内容是否已抓全',
  category         VARCHAR(50)    NULL     COMMENT '主分类(冗余字段,便于筛选)',
  age_rating       ENUM('all','adult') NOT NULL DEFAULT 'all' COMMENT '内容分级: all=全年龄段, adult=成人限定',
  pdf_path         VARCHAR(500)   NULL     COMMENT '导出 PDF 的本地路径',
  extra            JSON           NULL     COMMENT '扩展元数据',
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type_status (type, status),
  INDEX idx_title (title),
  INDEX idx_category (category),
  INDEX idx_age_rating (age_rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源主表';

-- ============================================================
-- 3. resource_sources - 资源来源(多来源)
-- ============================================================
CREATE TABLE resource_sources (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  resource_id         INT            NOT NULL COMMENT '关联 resources',
  source_site_id      INT            NOT NULL COMMENT '关联 source_sites',
  source_url          VARCHAR(500)   NOT NULL COMMENT '资源在源站的列表页URL',
  source_id           VARCHAR(255)   NULL     COMMENT '源站内ID(英文站 slug 可能较长)',
  raw_title           VARCHAR(255)   NULL     COMMENT '源站原始标题',
  raw_data            JSON           NULL     COMMENT '源站原始抓取数据快照',
  last_scraped_at     DATETIME       NULL     COMMENT '最近抓取时间',
  scrape_status       VARCHAR(20)    NOT NULL DEFAULT 'idle' COMMENT 'idle/running/success/failed',
  is_completed        TINYINT        NOT NULL DEFAULT 0 COMMENT '源站是否完结(0连载/1完结),定时任务据此判断是否抓取更新',
  last_chapter_order  INT            NOT NULL DEFAULT 0 COMMENT '增量抓取:上次抓到的章节序号',
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_site_source (source_site_id, source_id),
  INDEX idx_resource (resource_id),
  INDEX idx_scrape_status (scrape_status),
  CONSTRAINT fk_rs_resource    FOREIGN KEY (resource_id)    REFERENCES resources(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rs_source_site FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源来源';

-- ============================================================
-- 4. volumes - 卷/分卷
-- ============================================================
CREATE TABLE volumes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  resource_id INT            NOT NULL COMMENT '关联 resources',
  order_index INT            NOT NULL DEFAULT 0 COMMENT '卷序号',
  title       VARCHAR(255)   NULL     COMMENT '卷标题',
  CONSTRAINT fk_vol_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  INDEX idx_resource_order (resource_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='卷/分卷';

-- ============================================================
-- 5. chapters - 章节表(通用)
-- ============================================================
CREATE TABLE chapters (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  resource_id     INT            NOT NULL COMMENT '关联 resources',
  volume_id       INT            NULL     COMMENT '关联 volumes(可空)',
  order_index     INT            NOT NULL COMMENT '章节序号(全局排序)',
  title           VARCHAR(255)   NOT NULL COMMENT '章节标题',
  chapter_type    ENUM('text','image') NOT NULL DEFAULT 'text' COMMENT '内容类型',
  source_url      VARCHAR(500)   NULL     COMMENT '源站章节URL',
  source_site_id  INT            NULL     COMMENT '来源站点',
  word_count      INT            NOT NULL DEFAULT 0 COMMENT '字数(小说)',
  page_count      INT            NOT NULL DEFAULT 0 COMMENT '图片数(漫画)',
  is_downloaded   TINYINT        NOT NULL DEFAULT 0 COMMENT '内容是否已下载',
  downloaded_at   DATETIME       NULL     COMMENT '下载时间',
  published_at    DATETIME       NULL     COMMENT '源站原始发布时间',
  extra           JSON           NULL     COMMENT '扩展元数据(缩略图/爱心数等)',
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resource_site_order (resource_id, source_site_id, order_index),
  INDEX idx_resource_order (resource_id, order_index),
  CONSTRAINT fk_ch_resource    FOREIGN KEY (resource_id)    REFERENCES resources(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ch_volume      FOREIGN KEY (volume_id)      REFERENCES volumes(id)      ON DELETE SET NULL,
  CONSTRAINT fk_ch_source_site FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='章节表';

-- ============================================================
-- 6. chapter_texts - 文本内容(小说)
-- ============================================================
CREATE TABLE chapter_texts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id  INT            NOT NULL COMMENT '关联 chapters (1:1)',
  content     LONGTEXT       NOT NULL COMMENT '正文文本',
  word_count  INT            NOT NULL DEFAULT 0 COMMENT '字数',
  UNIQUE KEY uk_chapter (chapter_id),
  CONSTRAINT fk_ct_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='章节文本内容';

-- ============================================================
-- 7. chapter_images - 图片内容(漫画)
-- ============================================================
CREATE TABLE chapter_images (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id  INT            NOT NULL COMMENT '关联 chapters (1:N)',
  order_index INT            NOT NULL DEFAULT 0 COMMENT '图片序号',
  source_url  VARCHAR(500)   NOT NULL COMMENT '远程图片URL',
  local_path  VARCHAR(500)   NULL     COMMENT '本地存储路径',
  file_size   INT            NOT NULL DEFAULT 0 COMMENT '文件大小(字节)',
  status      VARCHAR(20)    NOT NULL DEFAULT 'pending' COMMENT 'pending/downloaded/failed',
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_chapter_order (chapter_id, order_index),
  CONSTRAINT fk_ci_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='章节图片内容';

-- ============================================================
-- 8. authors - 作者/画师
-- ============================================================
CREATE TABLE authors (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100)   NOT NULL COMMENT '名称',
  type           ENUM('author','artist','translator') NOT NULL DEFAULT 'author' COMMENT '角色',
  source_site_id INT            NULL     COMMENT '来源站点(可空)',
  CONSTRAINT fk_author_source FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE SET NULL,
  INDEX idx_name_type (name, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='作者/画师';

-- ============================================================
-- 9. resource_authors - 资源-作者关联
-- ============================================================
CREATE TABLE resource_authors (
  resource_id INT NOT NULL,
  author_id   INT NOT NULL,
  PRIMARY KEY (resource_id, author_id),
  CONSTRAINT fk_ra_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_author   FOREIGN KEY (author_id)   REFERENCES authors(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源-作者关联';

-- ============================================================
-- 10. categories - 分类
-- ============================================================
CREATE TABLE categories (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(50)    NOT NULL COMMENT '分类名',
  resource_type ENUM('novel','comic') NOT NULL COMMENT '适用的资源类型',
  parent_id     INT            NULL     COMMENT '父分类(支持层级)',
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
  INDEX idx_type (resource_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分类';

-- ============================================================
-- 11. resource_categories - 资源-分类关联
-- ============================================================
CREATE TABLE resource_categories (
  resource_id  INT NOT NULL,
  category_id  INT NOT NULL,
  PRIMARY KEY (resource_id, category_id),
  CONSTRAINT fk_rc_resource  FOREIGN KEY (resource_id)  REFERENCES resources(id)   ON DELETE CASCADE,
  CONSTRAINT fk_rc_category  FOREIGN KEY (category_id)  REFERENCES categories(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源-分类关联';

-- ============================================================
-- 12. tags - 标签
-- ============================================================
CREATE TABLE tags (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '标签名',
  UNIQUE KEY uk_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标签';

-- ============================================================
-- 13. resource_tags - 资源-标签关联
-- ============================================================
CREATE TABLE resource_tags (
  resource_id INT NOT NULL,
  tag_id      INT NOT NULL,
  PRIMARY KEY (resource_id, tag_id),
  CONSTRAINT fk_rt_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CONSTRAINT fk_rt_tag      FOREIGN KEY (tag_id)      REFERENCES tags(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资源-标签关联';

-- ============================================================
-- 14. scrape_tasks - 抓取任务
-- ============================================================
CREATE TABLE scrape_tasks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  resource_id    INT            NULL     COMMENT '关联 resources(可空,发现任务无具体资源)',
  source_site_id INT            NOT NULL COMMENT '关联 source_sites',
  task_type      ENUM('discover','full','incremental','refresh') NOT NULL DEFAULT 'full' COMMENT '任务类型',
  status         ENUM('pending','running','success','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT '任务状态',
  priority       INT            NOT NULL DEFAULT 0 COMMENT '优先级,数字越大越优先',
  config         JSON           NULL     COMMENT '任务级配置(覆盖站点默认)',
  total_items    INT            NOT NULL DEFAULT 0 COMMENT '预计抓取总数',
  done_items     INT            NOT NULL DEFAULT 0 COMMENT '已完成数',
  error_message  TEXT           NULL     COMMENT '失败原因',
  scheduled_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '计划执行时间',
  started_at     DATETIME       NULL     COMMENT '实际开始时间',
  finished_at    DATETIME       NULL     COMMENT '实际结束时间',
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_priority (status, priority DESC),
  INDEX idx_scheduled (scheduled_at),
  INDEX idx_resource (resource_id),
  CONSTRAINT fk_st_resource    FOREIGN KEY (resource_id)    REFERENCES resources(id)    ON DELETE SET NULL,
  CONSTRAINT fk_st_source_site FOREIGN KEY (source_site_id) REFERENCES source_sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抓取任务';

-- ============================================================
-- 15. scrape_logs - 抓取日志
-- ============================================================
CREATE TABLE scrape_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  task_id    INT            NOT NULL COMMENT '关联 scrape_tasks',
  level      ENUM('info','warn','error','debug') NOT NULL DEFAULT 'info' COMMENT '日志级别',
  message    TEXT           NOT NULL COMMENT '日志内容',
  context    JSON           NULL     COMMENT '上下文数据(URL/响应码等)',
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task (task_id),
  INDEX idx_level_time (level, created_at),
  CONSTRAINT fk_sl_task FOREIGN KEY (task_id) REFERENCES scrape_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抓取日志';

-- ============================================================
-- 16. files - 本地文件记录
-- ============================================================
CREATE TABLE files (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  resource_id   INT            NULL     COMMENT '关联 resources',
  chapter_id    INT            NULL     COMMENT '关联 chapters',
  file_type     ENUM('cover','image','text','thumbnail') NOT NULL COMMENT '文件类型',
  file_path     VARCHAR(500)   NOT NULL COMMENT '本地相对路径',
  file_size     INT            NOT NULL DEFAULT 0 COMMENT '文件大小(字节)',
  file_hash     VARCHAR(64)    NOT NULL COMMENT '文件SHA256(去重)',
  source_url    VARCHAR(500)   NULL     COMMENT '下载来源URL',
  downloaded_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下载时间',
  UNIQUE KEY uk_hash (file_hash),
  INDEX idx_resource (resource_id),
  INDEX idx_chapter (chapter_id),
  CONSTRAINT fk_file_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
  CONSTRAINT fk_file_chapter  FOREIGN KEY (chapter_id) REFERENCES chapters(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地文件记录';

SET FOREIGN_KEY_CHECKS = 1;
