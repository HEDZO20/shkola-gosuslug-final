-- Выполнить один раз в Supabase SQL Editor.
-- Добавляет возможность хранить несколько видео-частей в одном уроке.

alter table public.lessons
add column if not exists video_parts jsonb not null default '[]'::jsonb;

create index if not exists idx_lessons_published_sort
on public.lessons(is_published, sort_order);

comment on column public.lessons.video_parts is
'Список видео частей урока: [{"title":"Часть 1","type":"file","url":"https://..."}]';
