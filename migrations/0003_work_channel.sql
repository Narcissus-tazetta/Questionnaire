-- 告知本文で案内する「アンケート制作チャンネル」。告知を投稿する channel_id とは別。
ALTER TABLE guild_config ADD COLUMN work_channel_id TEXT;
