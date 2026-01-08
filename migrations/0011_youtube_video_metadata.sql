-- Add new columns to youtube_videos
ALTER TABLE youtube_videos ADD COLUMN duration_seconds INTEGER;
ALTER TABLE youtube_videos ADD COLUMN view_count INTEGER;
ALTER TABLE youtube_videos ADD COLUMN like_count INTEGER;
ALTER TABLE youtube_videos ADD COLUMN comment_count INTEGER;
ALTER TABLE youtube_videos ADD COLUMN best_thumbnail_url TEXT;
ALTER TABLE youtube_videos ADD COLUMN best_thumbnail_width INTEGER;
ALTER TABLE youtube_videos ADD COLUMN best_thumbnail_height INTEGER;
ALTER TABLE youtube_videos ADD COLUMN definition TEXT;
ALTER TABLE youtube_videos ADD COLUMN dimension TEXT;
ALTER TABLE youtube_videos ADD COLUMN licensed_content INTEGER;
ALTER TABLE youtube_videos ADD COLUMN caption INTEGER;
ALTER TABLE youtube_videos ADD COLUMN privacy_status TEXT;
ALTER TABLE youtube_videos ADD COLUMN embeddable INTEGER;
ALTER TABLE youtube_videos ADD COLUMN made_for_kids INTEGER;

-- Add new columns to youtube_channels
ALTER TABLE youtube_channels ADD COLUMN view_count INTEGER;
ALTER TABLE youtube_channels ADD COLUMN subscriber_count INTEGER;
ALTER TABLE youtube_channels ADD COLUMN video_count INTEGER;
ALTER TABLE youtube_channels ADD COLUMN country TEXT;
ALTER TABLE youtube_channels ADD COLUMN best_thumbnail_url TEXT;
ALTER TABLE youtube_channels ADD COLUMN best_thumbnail_width INTEGER;
ALTER TABLE youtube_channels ADD COLUMN best_thumbnail_height INTEGER;
