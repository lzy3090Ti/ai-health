-- 补齐 public.profiles 的表级权限（本项目关闭了 auto_expose_new_tables 时必需）
grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant select on public.profiles to service_role;
grant all on public.profiles to service_role;

-- 未来新增表默认授权（可选，便于后续扩展）
alter default privileges in schema public grant select on tables to authenticated;
