-- Школа Госуслуг: ускорение Supabase и журнал ошибок
-- Можно запускать поверх старой базы. Данные учеников, уроки и материалы не удаляются.

create extension if not exists pgcrypto;

-- Индексы для быстрых кабинетов, админки, поиска и статистики.
create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
create index if not exists idx_profiles_role_status_created on public.profiles (role, approval_status, created_at desc);
create index if not exists idx_lessons_published_sort on public.lessons (is_published, sort_order);
create index if not exists idx_quiz_lesson_sort on public.quiz_questions (lesson_id, sort_order);
create index if not exists idx_progress_user_lesson on public.lesson_progress (user_id, lesson_id);
create index if not exists idx_progress_user_updated on public.lesson_progress (user_id, updated_at desc);
create index if not exists idx_progress_lesson_updated on public.lesson_progress (lesson_id, updated_at desc);
create index if not exists idx_materials_published_created on public.materials (is_published, created_at desc);
create index if not exists idx_site_events_user_created on public.site_events (user_id, created_at desc);
create index if not exists idx_site_events_page_action_created on public.site_events (page, action, created_at desc);

-- Журнал ошибок сайта: сюда браузер записывает проблемы загрузки, кабинета и JavaScript.
create table if not exists public.site_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  page text default '',
  action text not null default 'client_error',
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_site_errors_created on public.site_errors (created_at desc);
create index if not exists idx_site_errors_user_created on public.site_errors (user_id, created_at desc);
create index if not exists idx_site_errors_page_action_created on public.site_errors (page, action, created_at desc);

alter table public.site_errors enable row level security;

drop policy if exists "errors_insert" on public.site_errors;
create policy "errors_insert" on public.site_errors for insert with check (true);

drop policy if exists "errors_admin_select" on public.site_errors;
create policy "errors_admin_select" on public.site_errors for select using (public.is_admin());

drop policy if exists "errors_admin_delete" on public.site_errors;
create policy "errors_admin_delete" on public.site_errors for delete using (public.is_admin());

-- Один быстрый запрос для личного кабинета ученика.
create or replace function public.get_my_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  result jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into prof
  from public.profiles
  where id = uid;

  select jsonb_build_object(
    'profile', coalesce(to_jsonb(prof), 'null'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sort_order)
      from public.lessons l
      where (prof.role = 'admin')
         or (l.is_published = true and prof.approval_status = 'approved')
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(to_jsonb(lp) order by lp.updated_at desc)
      from public.lesson_progress lp
      where lp.user_id = uid
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at desc)
      from (
        select * from public.materials
        where (prof.role = 'admin')
           or (is_published = true and prof.approval_status = 'approved')
        order by created_at desc
        limit 200
      ) m
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_my_dashboard() to authenticated;

-- Один быстрый запрос для админки: настройки, уроки, материалы, ученики, прогресс, активность, ошибки.
create or replace function public.get_admin_dashboard(p_rows_limit int default 1000, p_events_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rows_limit int := least(greatest(coalesce(p_rows_limit, 1000), 10), 5000);
  events_limit int := least(greatest(coalesce(p_events_limit, 200), 10), 1000);
  result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin_required';
  end if;

  select jsonb_build_object(
    'settings', coalesce((select to_jsonb(s) from public.site_settings s where s.id = 1), '{}'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sort_order)
      from public.lessons l
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at desc)
      from (
        select * from public.materials
        order by created_at desc
        limit rows_limit
      ) m
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from (
        select * from public.profiles
        order by created_at desc
        limit rows_limit
      ) p
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'user_id', x.user_id,
          'lesson_id', x.lesson_id,
          'video_watched', x.video_watched,
          'practice_done', x.practice_done,
          'quiz_score', x.quiz_score,
          'completed', x.completed,
          'completed_at', x.completed_at,
          'updated_at', x.updated_at,
          'profiles', jsonb_build_object('email', x.email, 'full_name', x.full_name, 'phone', x.phone),
          'lessons', jsonb_build_object('title', x.lesson_title, 'sort_order', x.lesson_sort_order)
        ) order by x.updated_at desc
      )
      from (
        select lp.*, p.email, p.full_name, p.phone, l.title as lesson_title, l.sort_order as lesson_sort_order
        from public.lesson_progress lp
        left join public.profiles p on p.id = lp.user_id
        left join public.lessons l on l.id = lp.lesson_id
        order by lp.updated_at desc
        limit rows_limit
      ) x
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from (
        select * from public.site_events
        order by created_at desc
        limit events_limit
      ) e
    ), '[]'::jsonb),
    'errors', coalesce((
      select jsonb_agg(to_jsonb(er) order by er.created_at desc)
      from (
        select * from public.site_errors
        order by created_at desc
        limit 100
      ) er
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.get_admin_dashboard(int, int) to authenticated;
