CREATE INDEX `records_kind_updated` ON `records` (`kind`,`updated_at`);
--> statement-breakpoint
-- SQLite expression index maintained explicitly: one unfinished job per source.
CREATE UNIQUE INDEX `crawl_one_open_source` ON `records` (json_extract(payload, '$.sourceId')) WHERE kind='crawlJob' AND json_extract(payload, '$.status')!='complete';
