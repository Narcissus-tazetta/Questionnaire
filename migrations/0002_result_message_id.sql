-- 抽選告知メッセージのID。再抽選時に元メッセージを編集するために使う。
ALTER TABLE daily_results ADD COLUMN message_id TEXT;
