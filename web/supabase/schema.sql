-- Ai·健康 Supabase 数据库结构
-- 在 Supabase SQL Editor 中整段执行一次即可。

-- 1. 用户档案表
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  plan_status text not null default 'none' check (plan_status in ('none', 'trial', 'expired', 'paid')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and plan_status = (select plan_status from public.profiles where id = auth.uid()));

-- 2. 注册时自动创建档案
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. 申请 24h 体验（每人一次，服务端时间为准）
create or replace function public.start_trial()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  current_profile public.profiles;
begin
  select * into current_profile from public.profiles where id = auth.uid();
  if not found then
    raise exception 'profile not found';
  end if;
  if current_profile.plan_status = 'paid' then
    return current_profile;
  end if;
  if current_profile.trial_ends_at is not null then
    raise exception 'trial already used';
  end if;
  update public.profiles
    set trial_started_at = now(),
        trial_ends_at = now() + interval '24 hours',
        plan_status = 'trial'
    where id = auth.uid()
    returning * into current_profile;
  return current_profile;
end;
$$;

revoke all on function public.start_trial() from public;
grant execute on function public.start_trial() to authenticated;
