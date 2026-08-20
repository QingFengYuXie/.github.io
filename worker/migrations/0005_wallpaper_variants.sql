ALTER TABLE wallpaper_config ADD COLUMN mobile_object_key TEXT;
ALTER TABLE wallpaper_config ADD COLUMN mobile_content_type TEXT;
ALTER TABLE wallpaper_config ADD COLUMN mobile_size_bytes INTEGER NOT NULL DEFAULT 0;

-- Promote the currently configured R2 wallpaper to the optimized v12 variants.
-- The version guard keeps fresh/local databases on their normal empty state.
UPDATE wallpaper_config
   SET object_key = 'wallpaper/lightwind-desktop-v12.webp',
       content_type = 'image/webp',
       size_bytes = 595302,
       mobile_object_key = 'wallpaper/lightwind-mobile-v12.webp',
       mobile_content_type = 'image/webp',
       mobile_size_bytes = 755190,
       version = 12,
       updated_at = unixepoch()
 WHERE id = 1
   AND version = 11
   AND object_key IS NOT NULL;
