-- Школа Госуслуг: база данных для полноценной платформы
-- Выполните этот файл 1 раз в Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  site_title text not null default 'Школа Госуслуг',
  site_subtitle text not null default 'Научитесь пользоваться государственными услугами быстро и уверенно',
  site_logo text default '✦',
  hero_badge text default '🚀 Полноценная учебная платформа',
  hero_title text default 'Научитесь пользоваться',
  hero_highlight text default 'госуслугами',
  hero_text text not null default 'Простые видеоуроки, понятные инструкции, практические задания и тесты. Уроки открываются поэтапно после просмотра видео и успешного теста.',
  primary_button_text text default 'Пройти курс',
  secondary_button_text text default 'Личный кабинет',
  whatsapp_phone text default '79000000000',
  passing_score int not null default 70,
  about_title text default 'О курсе',
  about_text text default 'Курс помогает ученику уверенно пользоваться онлайн-сервисами: смотреть понятные видео, повторять действия по шагам, закреплять знания тестами и видеть свой прогресс в личном кабинете.',
  about_cards jsonb not null default '["Подходит для новичков", "Можно проходить с телефона", "Уроки открываются по порядку"]'::jsonb,
  process_title text default 'Как проходит обучение',
  process_steps jsonb not null default '["Зарегистрируйтесь и откройте курс", "Посмотрите видеоурок", "Выполните инструкцию и практику", "Пройдите тест и откройте следующий урок"]'::jsonb,
  support_title text default 'Нужна помощь?',
  support_text text default 'Если у ученика возник вопрос по уроку, он может сразу написать преподавателю в WhatsApp.',
  theme_primary text default '#42d7ff',
  theme_secondary text default '#8b5cf6',
  theme_accent text default '#ff4ecd',
  site_width int default 1360,
  footer_text text default '',
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id)
values (1)
on conflict (id) do nothing;

-- Обновление старых проектов: добавляем новые поля, если вы уже запускали прежний setup.sql.
alter table public.site_settings add column if not exists site_logo text default '✦';
alter table public.site_settings add column if not exists hero_badge text default '🚀 Полноценная учебная платформа';
alter table public.site_settings add column if not exists hero_title text default 'Научитесь пользоваться';
alter table public.site_settings add column if not exists hero_highlight text default 'госуслугами';
alter table public.site_settings add column if not exists primary_button_text text default 'Пройти курс';
alter table public.site_settings add column if not exists secondary_button_text text default 'Личный кабинет';
alter table public.site_settings add column if not exists about_title text default 'О курсе';
alter table public.site_settings add column if not exists about_text text default 'Курс помогает ученику уверенно пользоваться онлайн-сервисами: смотреть понятные видео, повторять действия по шагам, закреплять знания тестами и видеть свой прогресс в личном кабинете.';
alter table public.site_settings add column if not exists about_cards jsonb not null default '["Подходит для новичков", "Можно проходить с телефона", "Уроки открываются по порядку"]'::jsonb;
alter table public.site_settings add column if not exists process_title text default 'Как проходит обучение';
alter table public.site_settings add column if not exists process_steps jsonb not null default '["Зарегистрируйтесь и откройте курс", "Посмотрите видеоурок", "Выполните инструкцию и практику", "Пройдите тест и откройте следующий урок"]'::jsonb;
alter table public.site_settings add column if not exists support_title text default 'Нужна помощь?';
alter table public.site_settings add column if not exists support_text text default 'Если у ученика возник вопрос по уроку, он может сразу написать преподавателю в WhatsApp.';
alter table public.site_settings add column if not exists theme_primary text default '#42d7ff';
alter table public.site_settings add column if not exists theme_secondary text default '#8b5cf6';
alter table public.site_settings add column if not exists theme_accent text default '#ff4ecd';
alter table public.site_settings add column if not exists site_width int default 1360;
alter table public.site_settings add column if not exists footer_text text default '';

-- Если в старой версии на главной было выделено слово "уверенно" или "услугами", меняем на "госуслугами".
update public.site_settings
set hero_title = 'Научитесь пользоваться',
    hero_highlight = 'госуслугами'
where id = 1 and coalesce(hero_highlight, '') in ('уверенно', 'услугами');

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 1,
  icon text not null default '🎓',
  title text not null,
  description text default '',
  duration text default '10 минут',
  video_type text not null default 'none' check (video_type in ('none','youtube','file','external')),
  video_url text default '',
  content text default '',
  steps jsonb not null default '[]'::jsonb,
  mistakes jsonb not null default '[]'::jsonb,
  practice text default '',
  passing_score int,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  sort_order int not null default 1,
  question text not null,
  answers jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  video_watched boolean not null default false,
  practice_done boolean not null default false,
  quiz_score int,
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);

-- События сайта для простой аналитики в админке.

-- Обновление старых проектов: добавляем отдельный статус практического задания.
alter table public.lesson_progress add column if not exists practice_done boolean not null default false;

-- Библиотека материалов: PDF, картинки, дополнительные видео и памятки.
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text default '',
  file_url text not null,
  file_path text default '',
  file_type text default 'file',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_materials_lesson_id on public.materials(lesson_id);
create index if not exists idx_materials_created_at on public.materials(created_at desc);

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  page text default '',
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_site_events_created_at on public.site_events(created_at desc);
create index if not exists idx_site_events_action on public.site_events(action);

-- Автоматически создаем профиль после регистрации пользователя.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_lessons on public.lessons;
create trigger touch_lessons before update on public.lessons
for each row execute function public.touch_updated_at();

drop trigger if exists touch_progress on public.lesson_progress;
create trigger touch_progress before update on public.lesson_progress
for each row execute function public.touch_updated_at();

drop trigger if exists touch_materials on public.materials;
create trigger touch_materials before update on public.materials
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.site_settings enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.materials enable row level security;
alter table public.site_events enable row level security;

-- Чтение настроек доступно всем, изменение только администратору.
drop policy if exists "settings_read" on public.site_settings;
create policy "settings_read" on public.site_settings for select using (true);

drop policy if exists "settings_admin_update" on public.site_settings;
create policy "settings_admin_update" on public.site_settings for update using (public.is_admin()) with check (public.is_admin());

-- Профили: ученик видит себя, админ видит всех.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert with check (id = auth.uid() and role = 'student');

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid() and role = 'student') with check (id = auth.uid() and role = 'student');

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Уроки: опубликованные видят все авторизованные, админ управляет всеми.
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons for select using (is_published = true or public.is_admin());

drop policy if exists "lessons_admin_insert" on public.lessons;
create policy "lessons_admin_insert" on public.lessons for insert with check (public.is_admin());

drop policy if exists "lessons_admin_update" on public.lessons;
create policy "lessons_admin_update" on public.lessons for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lessons_admin_delete" on public.lessons;
create policy "lessons_admin_delete" on public.lessons for delete using (public.is_admin());

-- Тесты: ученики читают, админы управляют.
drop policy if exists "quiz_select" on public.quiz_questions;
create policy "quiz_select" on public.quiz_questions for select using (
  public.is_admin() or exists (select 1 from public.lessons l where l.id = lesson_id and l.is_published = true)
);

drop policy if exists "quiz_admin_insert" on public.quiz_questions;
create policy "quiz_admin_insert" on public.quiz_questions for insert with check (public.is_admin());

drop policy if exists "quiz_admin_update" on public.quiz_questions;
create policy "quiz_admin_update" on public.quiz_questions for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz_admin_delete" on public.quiz_questions;
create policy "quiz_admin_delete" on public.quiz_questions for delete using (public.is_admin());

-- Прогресс: ученик управляет только своим, админ видит всех.
drop policy if exists "progress_select" on public.lesson_progress;
create policy "progress_select" on public.lesson_progress for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "progress_insert_self" on public.lesson_progress;
create policy "progress_insert_self" on public.lesson_progress for insert with check (user_id = auth.uid());

drop policy if exists "progress_update_self" on public.lesson_progress;
create policy "progress_update_self" on public.lesson_progress for update using (user_id = auth.uid()) with check (user_id = auth.uid());


-- Материалы: опубликованные видят авторизованные, админ управляет всеми.
drop policy if exists "materials_select" on public.materials;
create policy "materials_select" on public.materials for select using (is_published = true or public.is_admin());

drop policy if exists "materials_admin_insert" on public.materials;
create policy "materials_admin_insert" on public.materials for insert with check (public.is_admin());

drop policy if exists "materials_admin_update" on public.materials;
create policy "materials_admin_update" on public.materials for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "materials_admin_delete" on public.materials;
create policy "materials_admin_delete" on public.materials for delete using (public.is_admin());

-- Аналитика: сайт может добавлять события, админ может читать.
drop policy if exists "events_insert" on public.site_events;
create policy "events_insert" on public.site_events for insert with check (true);

drop policy if exists "events_admin_select" on public.site_events;
create policy "events_admin_select" on public.site_events for select using (public.is_admin());

drop policy if exists "events_admin_delete" on public.site_events;
create policy "events_admin_delete" on public.site_events for delete using (public.is_admin());

-- Примеры уроков, чтобы сайт сразу выглядел заполненным.
-- Блок написан так, чтобы повторный запуск setup.sql не создавал дубликаты.
insert into public.lessons (sort_order, icon, title, description, duration, content, steps, mistakes, practice, is_published)
select *
from (values
  (1, '🧭', 'Что такое Госуслуги и как проходит курс', 'Стартовый урок: для чего нужен портал и как устроено обучение.', '8 минут', 'Госуслуги помогают получать государственные услуги онлайн. В этом курсе ученик учится действовать по инструкции, смотреть видео, читать подсказки и закреплять материал тестами.', '["Открыть курс", "Изучить видео", "Прочитать инструкцию", "Пройти тест"]'::jsonb, '["Пытаться открыть все уроки сразу", "Пропускать инструкцию", "Не сохранять прогресс"]'::jsonb, 'Откройте личный кабинет и посмотрите, где отображается прогресс.', true),
  (2, '🔐', 'Безопасный вход и защита аккаунта', 'Пароли, SMS-коды, проверка адреса сайта и базовая безопасность.', '12 минут', 'Безопасность — первый навык при работе с государственными сервисами. Пароль и SMS-код нельзя сообщать другим людям.', '["Проверить адрес сайта", "Не сообщать SMS-коды", "Использовать надежный пароль", "Включить дополнительную защиту"]'::jsonb, '["Передавать код помощнику", "Открывать подозрительные ссылки", "Использовать один пароль везде"]'::jsonb, 'Составьте список признаков безопасного входа.', true),
  (3, '🔎', 'Поиск нужной услуги', 'Как пользоваться поиском, разделами и описанием услуги.', '10 минут', 'Для поиска услуги лучше использовать короткие понятные запросы: справка, запись к врачу, замена паспорта, госпошлина.', '["Открыть поиск", "Ввести короткий запрос", "Открыть услугу", "Прочитать условия"]'::jsonb, '["Искать слишком длинной фразой", "Не читать описание", "Выбирать первую услугу без проверки"]'::jsonb, 'Придумайте 3 запроса для поиска услуг.', true)
) as v(sort_order, icon, title, description, duration, content, steps, mistakes, practice, is_published)
where not exists (select 1 from public.lessons);

insert into public.quiz_questions (lesson_id, sort_order, question, answers, correct_index)
select l.id, v.sort_order, v.question, v.answers, v.correct_index
from public.lessons l
join (values
  (1, 1, 'Как открываются уроки в курсе?', '["Все сразу", "По порядку после выполнения предыдущего", "Случайно"]'::jsonb, 1),
  (1, 2, 'Что показывает личный кабинет?', '["Прогресс обучения", "Погоду", "Музыку"]'::jsonb, 0),
  (2, 1, 'Можно ли передавать SMS-код другому человеку?', '["Да", "Нет", "Только знакомым"]'::jsonb, 1),
  (2, 2, 'Что нужно проверить перед входом?', '["Адрес сайта", "Цвет кнопки", "Размер экрана"]'::jsonb, 0),
  (3, 1, 'Как быстрее найти услугу?', '["Через поиск", "Случайно нажимать", "Закрыть сайт"]'::jsonb, 0),
  (3, 2, 'Что нужно прочитать перед оформлением?', '["Описание услуги", "Новости спорта", "Настройки монитора"]'::jsonb, 0)
) as v(lesson_sort_order, sort_order, question, answers, correct_index)
  on l.sort_order = v.lesson_sort_order
where not exists (
  select 1
  from public.quiz_questions q
  where q.lesson_id = l.id
    and q.sort_order = v.sort_order
    and q.question = v.question
);


-- Пример материалов библиотеки.
insert into public.materials (title, description, file_url, file_type, is_published)
select * from (values
  ('Памятка ученика', 'Короткий чек-лист перед началом прохождения курса.', '#', 'pdf', true),
  ('Шаблон заметок по уроку', 'Можно использовать как конспект во время обучения.', '#', 'file', true)
) as v(title, description, file_url, file_type, is_published)
where not exists (select 1 from public.materials);

-- Storage bucket для видео и файлов.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-files', 'lesson-files', true, 524288000, array['video/mp4','video/webm','video/quicktime','video/x-m4v','image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Публичное чтение файлов.
drop policy if exists "lesson_files_read" on storage.objects;
create policy "lesson_files_read" on storage.objects for select using (bucket_id = 'lesson-files');

-- Загружать/менять/удалять файлы может только админ.
drop policy if exists "lesson_files_admin_insert" on storage.objects;
create policy "lesson_files_admin_insert" on storage.objects for insert with check (bucket_id = 'lesson-files' and public.is_admin());

drop policy if exists "lesson_files_admin_update" on storage.objects;
create policy "lesson_files_admin_update" on storage.objects for update using (bucket_id = 'lesson-files' and public.is_admin()) with check (bucket_id = 'lesson-files' and public.is_admin());

drop policy if exists "lesson_files_admin_delete" on storage.objects;
create policy "lesson_files_admin_delete" on storage.objects for delete using (bucket_id = 'lesson-files' and public.is_admin());
