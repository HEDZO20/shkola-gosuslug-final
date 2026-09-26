-- Добавляет поддержку PNG/JPG/WEBP/SVG логотипа и адаптивного фона под логотип
alter table public.site_settings add column if not exists site_logo_url text default '';
alter table public.site_settings add column if not exists site_logo_bg text default '';

-- Логотипы загружаются в существующий public bucket lesson-files в папку site/
-- Если bucket lesson-files уже создан прошлым setup.sql, больше ничего делать не нужно.
