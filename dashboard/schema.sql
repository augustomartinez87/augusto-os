-- Control plane de augusto-os (S-007). Correr en el SQL editor del proyecto Supabase DEDICADO
-- (NO la prod de Kredy/Argos). El runner escribe con service_role; el dashboard lee con anon.

create table if not exists orch_runs (
  feature_id   text primary key,
  target       text,
  title        text,
  state        text,            -- active | review | blocked | waiting | done
  current_step int,
  total_steps  int,
  branch       text,
  updated_at   timestamptz default now()
);

create table if not exists orch_steps (
  feature_id  text not null,
  step_no     int  not null,
  descripcion text,
  status      text,            -- pending | running | done | blocked
  commit_sha  text,
  updated_at  timestamptz default now(),
  primary key (feature_id, step_no)
);

create table if not exists orch_logs (
  id         bigint generated always as identity primary key,
  feature_id text,
  line       text,
  ts         timestamptz default now()
);
create index if not exists orch_logs_ts_idx on orch_logs (ts desc);

create table if not exists orch_ideas (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  source     text default 'web',   -- web | telegram | local
  status     text default 'new',   -- new | triaged
  created_at timestamptz default now()
);

-- RLS: anon (el dashboard) puede LEER todo y SOLO insertar ideas. El service_role del runner bypassa RLS.
alter table orch_runs  enable row level security;
alter table orch_steps enable row level security;
alter table orch_logs  enable row level security;
alter table orch_ideas enable row level security;

create policy "anon read runs"  on orch_runs  for select to anon using (true);
create policy "anon read steps" on orch_steps for select to anon using (true);
create policy "anon read logs"  on orch_logs  for select to anon using (true);
create policy "anon read ideas" on orch_ideas for select to anon using (true);
create policy "anon add ideas"  on orch_ideas for insert to anon with check (true);

-- Backlog espejado desde system/BACKLOG.md (para la pestaña de pendientes por proyecto).
create table if not exists orch_backlog (
  item_id    text primary key,
  project    text,
  priority   text,
  label      text,
  state      text,
  updated_at timestamptz default now()
);
alter table orch_backlog enable row level security;
create policy "anon read backlog" on orch_backlog for select to anon using (true);

-- Fila única de configuración del modo operativo (S-007b). El dashboard puede leerla y actualizarla;
-- el runner (sync.ts) la lee y sincroniza a system/OPERATOR_STATE.yaml en cada tick.
create table if not exists orch_operator_state (
  id              int primary key default 1,
  mode            text not null default 'PRODUCT',  -- PRODUCT | OFFICE | SLEEP
  response_style  text not null default 'normal',    -- normal | short
  updated_at      timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into orch_operator_state (id, mode, response_style) values (1, 'PRODUCT', 'normal')
  on conflict (id) do nothing;

alter table orch_operator_state enable row level security;
create policy "anon read operator_state"   on orch_operator_state for select to anon using (true);
create policy "anon update operator_state" on orch_operator_state for update to anon using (id = 1) with check (id = 1);
