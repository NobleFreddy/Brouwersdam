-- Brouwersdam Sticker-Jagd — Datenbankschema
-- Im Supabase SQL-Editor (Dashboard -> SQL Editor -> New query) komplett einfügen und ausführen.
--
-- Sicherheitsprinzip: Alle Tabellen haben RLS aktiviert und KEINE Policies für die
-- öffentliche "anon"-Rolle. Sämtlicher Zugriff läuft über SECURITY DEFINER-Funktionen
-- (unten), die serverseitig prüfen, validieren und erst dann lesen/schreiben. PINs und
-- das Admin-Passwort werden nie im Klartext gespeichert oder zurückgegeben.

create extension if not exists pgcrypto;

-- ---------- Tabellen ----------------------------------------------------

create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_key    text generated always as (lower(trim(name))) stored,
  pin_hash    text not null,
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (name_key)
);

create table if not exists player_sessions (
  token       uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '60 days'
);

create table if not exists days (
  id                  int primary key,              -- 1..5
  sort_order          int not null,
  title               text not null,
  teaser              text not null,                 -- Kurzbeschreibung, sichtbar (verschwommen) solange gesperrt
  code                text not null,                  -- 4-stelliger Sticker-Code
  opens_at            timestamptz,                    -- frühester Zeitpunkt, ab dem der Code akzeptiert wird
  puzzle_type         text not null default 'riddle', -- 'riddle' | 'choice' | 'minigame'
  puzzle_question     text,
  puzzle_choices      jsonb,                          -- [{ "id": "a", "label": "..." }, ...] für 'choice'
  puzzle_answer       text,                            -- normalisierte Lösung bzw. choice-id
  base_points         int not null default 10,
  bonus_points        int not null default 5,
  bonus_window_seconds int not null default 120,       -- Schnell-Bonus-Fenster ab Freischaltung
  finale_material_photo text,                          -- Foto für den Materialcheck an Tag 5 (base64 data-URL)
  updated_at          timestamptz not null default now()
);
-- "create table if not exists" legt die Spalte oben nur bei einer brandneuen Tabelle an;
-- bei einem bereits bestehenden days (wie in der Live-Datenbank) muss sie explizit ergänzt werden.
alter table days add column if not exists finale_material_photo text;

create table if not exists player_days (
  player_id       uuid not null references players(id) on delete cascade,
  day_id          int  not null references days(id) on delete cascade,
  unlocked_at     timestamptz,
  solved_at       timestamptz,
  attempts        int not null default 0,
  points_awarded  int not null default 0,
  primary key (player_id, day_id)
);

create table if not exists admin_sessions (
  token       uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 hours'
);

create table if not exists admin_settings (
  id            boolean primary key default true check (id),
  password_hash text not null
);

-- Quiz-Fragen für Tag 1 (puzzle_type = 'quiz'). Eine Zeile pro Frage, entweder vom
-- Typ 'choice' (Multiple Choice, choices/correct_choice_id gefüllt) oder 'point'
-- (Punkt auf einem Foto markieren, image_data_url/correct_x/correct_y gefüllt).
-- Bilder werden clientseitig komprimiert und als base64 data-URL gespeichert -
-- bewusst kein Supabase Storage, damit weiterhin ausnahmslos alle Daten über die
-- Funktionen unten laufen und kein separater Storage-Bucket samt eigenen Policies
-- eingerichtet werden muss.
create table if not exists quiz_questions (
  id                 uuid primary key default gen_random_uuid(),
  day_id             int  not null references days(id) on delete cascade,
  sort_order         int  not null default 0,
  kind               text not null default 'choice',   -- 'choice' | 'point'
  prompt             text not null,
  time_limit_seconds int  not null default 20,
  points_base        int  not null default 10,
  choices            jsonb,                              -- [{ "id": "a", "label": "..." }, ...] für 'choice'
  correct_choice_id  text,                                -- passende choices[].id für 'choice'
  image_data_url     text,                                -- data:image/jpeg;base64,... für 'point'
  correct_x          numeric(5,4),                        -- 0..1, Bruchteil der Bildbreite, für 'point'
  correct_y          numeric(5,4),                        -- 0..1, Bruchteil der Bildhöhe, für 'point'
  tolerance_radius   numeric(5,4) not null default 0.08,  -- 0..1, Toleranzradius als Bruchteil der Bildbreite
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint quiz_questions_kind_check check (kind in ('choice', 'point')),
  constraint quiz_questions_image_size_check check (image_data_url is null or length(image_data_url) <= 2500000)
);

create index if not exists quiz_questions_day_id_idx on quiz_questions (day_id, sort_order);

-- Freitext-Antworten zum Materialcheck-Foto an Tag 5 (puzzle_type = 'finale'). Wird nicht
-- automatisch bewertet - der Admin liest die Antworten und vergibt manuell Punkte, die
-- direkt zum Spielerkonto addiert werden (siehe admin_grade_finale_answer).
create table if not exists finale_material_answers (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  day_id        int  not null references days(id) on delete cascade,
  answer_text   text not null,
  submitted_at  timestamptz not null default now(),
  grade_points  int,
  graded_at     timestamptz,
  unique (player_id, day_id)
);

alter table players         enable row level security;
alter table player_sessions enable row level security;
alter table days            enable row level security;
alter table player_days     enable row level security;
alter table admin_sessions  enable row level security;
alter table admin_settings  enable row level security;
alter table quiz_questions  enable row level security;
alter table finale_material_answers enable row level security;
-- Bewusst keine Policies -> anon/authenticated haben ohne die Funktionen unten keinerlei Zugriff.

-- ---------- Startdaten ---------------------------------------------------

insert into admin_settings (id, password_hash)
values (true, crypt('brouwersdam2026', gen_salt('bf')))
on conflict (id) do nothing;
-- WICHTIG: Direkt nach dem Einrichten im Admin-Bereich unter "Passwort ändern" ein eigenes setzen!

insert into days (id, sort_order, title, teaser, code, opens_at, puzzle_type, puzzle_question, puzzle_choices, puzzle_answer, base_points, bonus_points)
values
  (1, 1, 'Strand-Quiz',           'Beantworte Fragen und markiere Orte auf Fotos.', '1111', null, 'quiz', null, null, null, 10, 5),
  (2, 2, 'Segeltrimm-Minigame',   'Finde den richtigen Trimm.',           '2222', null, 'minigame', null, null, null, 10, 5),
  (3, 3, 'Windsurf-Simulation',   'Board aufbauen, Bojen umrunden, Route planen.', '3333', null, 'windsurf_sim', null, null, null, 10, 5),
  (4, 4, 'Windsurf-Theorieprüfung', 'Vorfahrt, Sicherheit und Praxiswissen.', '4444', null, 'theory_exam', null, null, null, 20, 10),
  (5, 5, 'Abschlussmission',      'Materialcheck, dann eine durchgehende Fahrt zum Ziel.', '5555', null, 'finale', null, null, null, 25, 15)
on conflict (id) do nothing;

-- Aktualisiert Tag 1 auf das Quiz, auch wenn die Zeile aus einem früheren Lauf
-- dieses Skripts schon existiert (der INSERT oben greift dank ON CONFLICT DO
-- NOTHING dann nicht mehr). Die eigentlichen Fragen werden separat über die
-- Admin-Oberfläche gepflegt (Tabelle quiz_questions), nicht hier geseedet.
update days set
  title = 'Strand-Quiz',
  teaser = 'Beantworte Fragen und markiere Orte auf Fotos.',
  puzzle_type = 'quiz',
  puzzle_question = null,
  puzzle_choices = null,
  puzzle_answer = null
where id = 1 and puzzle_type <> 'quiz';

-- Aktualisiert Tag 3 auf die Windsurf-Simulation, auch wenn die Zeile aus einem
-- früheren Lauf dieses Skripts schon existiert (der INSERT oben greift dank
-- ON CONFLICT DO NOTHING dann nicht mehr).
update days set
  title = 'Windsurf-Simulation',
  teaser = 'Board aufbauen, Bojen umrunden, Route planen.',
  puzzle_type = 'windsurf_sim',
  puzzle_question = null,
  puzzle_choices = null,
  puzzle_answer = null
where id = 3 and puzzle_type <> 'windsurf_sim';

update days set
  title = 'Windsurf-Theorieprüfung',
  teaser = 'Vorfahrt, Sicherheit und Praxiswissen.',
  puzzle_type = 'theory_exam',
  puzzle_question = null,
  puzzle_choices = null,
  puzzle_answer = null,
  base_points = 20,
  bonus_points = 10
where id = 4 and puzzle_type <> 'theory_exam';

update days set
  title = 'Abschlussmission',
  teaser = 'Materialcheck, dann eine durchgehende Fahrt zum Ziel.',
  puzzle_type = 'finale',
  puzzle_question = null,
  puzzle_choices = null,
  puzzle_answer = null,
  base_points = 25,
  bonus_points = 15
where id = 5 and puzzle_type <> 'finale';

-- ---------- Hilfsfunktionen (intern) -------------------------------------

create or replace function _valid_player_session(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid;
begin
  select player_id into v_player_id
  from player_sessions
  where token = p_token and expires_at > now();

  if v_player_id is null then
    raise exception 'Sitzung abgelaufen. Bitte erneut anmelden.' using errcode = '28000';
  end if;

  return v_player_id;
end;
$$;

create or replace function _valid_admin_session(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from admin_sessions where token = p_token and expires_at > now()) then
    raise exception 'Admin-Sitzung abgelaufen. Bitte erneut anmelden.' using errcode = '28000';
  end if;
  return true;
end;
$$;

-- ---------- Spieler: Registrierung / Login -------------------------------

create or replace function register_or_login(p_name text, p_pin text)
returns table(token uuid, player_id uuid, player_name text, points int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := trim(p_name);
  v_key  text := lower(v_name);
  v_row  players%rowtype;
  v_token uuid;
begin
  if v_name = '' or length(v_name) > 40 then
    raise exception 'Bitte einen gültigen Namen eingeben.';
  end if;
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN muss aus 4 bis 8 Ziffern bestehen.';
  end if;

  select * into v_row from players where name_key = v_key;

  if found then
    if v_row.pin_hash <> crypt(p_pin, v_row.pin_hash) then
      raise exception 'Name existiert bereits, aber die PIN stimmt nicht.';
    end if;
  else
    insert into players (name, pin_hash) values (v_name, crypt(p_pin, gen_salt('bf')))
    returning * into v_row;
  end if;

  insert into player_sessions (player_id) values (v_row.id) returning player_sessions.token into v_token;

  return query select v_token, v_row.id, v_row.name, v_row.points;
end;
$$;

grant execute on function register_or_login(text, text) to anon;

-- ---------- Spieler: eigenen Stand abrufen --------------------------------

create or replace function get_my_state(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_player players%rowtype;
  v_days jsonb;
  v_rank int;
begin
  select * into v_player from players where id = v_player_id;

  select coalesce(jsonb_agg(day_obj order by x.sort_order), '[]'::jsonb) into v_days
  from (
    select
      d.id, d.sort_order, d.title, d.teaser, d.opens_at, d.puzzle_type,
      d.base_points, d.bonus_points, d.bonus_window_seconds,
      pd.unlocked_at, pd.solved_at, pd.attempts, pd.points_awarded,
      case when pd.unlocked_at is not null then d.puzzle_question else null end as puzzle_question,
      case when pd.unlocked_at is not null then d.puzzle_choices else null end as puzzle_choices,
      jsonb_build_object(
        'id', d.id, 'sortOrder', d.sort_order, 'title', d.title, 'teaser', d.teaser,
        'opensAt', d.opens_at, 'puzzleType', d.puzzle_type,
        'basePoints', d.base_points, 'bonusPoints', d.bonus_points, 'bonusWindowSeconds', d.bonus_window_seconds,
        'unlockedAt', pd.unlocked_at, 'solvedAt', pd.solved_at, 'attempts', coalesce(pd.attempts, 0),
        'pointsAwarded', coalesce(pd.points_awarded, 0),
        'puzzleQuestion', case when pd.unlocked_at is not null then d.puzzle_question else null end,
        'puzzleChoices', case when pd.unlocked_at is not null then d.puzzle_choices else null end,
        'finaleMaterialPhoto', case when pd.unlocked_at is not null then d.finale_material_photo else null end
      ) as day_obj
    from days d
    left join player_days pd on pd.day_id = d.id and pd.player_id = v_player_id
    order by d.sort_order
  ) x;

  select count(*) + 1 into v_rank
  from players p
  where p.points > v_player.points;

  return jsonb_build_object(
    'playerId', v_player.id,
    'name', v_player.name,
    'points', v_player.points,
    'rank', v_rank,
    'days', v_days
  );
end;
$$;

grant execute on function get_my_state(uuid) to anon;

-- ---------- Spieler: Tag mit Sticker-Code freischalten --------------------

create or replace function unlock_day(p_token uuid, p_day_id int, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_day days%rowtype;
  v_existing player_days%rowtype;
begin
  select * into v_day from days where id = p_day_id;
  if not found then
    raise exception 'Unbekannter Tag.';
  end if;

  if v_day.opens_at is not null and now() < v_day.opens_at then
    raise exception 'Dieser Tag ist noch nicht geöffnet.';
  end if;

  select * into v_existing from player_days where player_id = v_player_id and day_id = p_day_id;

  if found and v_existing.unlocked_at is not null then
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true);
  end if;

  if trim(lower(p_code)) <> lower(v_day.code) then
    insert into player_days (player_id, day_id, attempts)
    values (v_player_id, p_day_id, 1)
    on conflict (player_id, day_id)
    do update set attempts = player_days.attempts + 1;
    raise exception 'Code ist leider falsch.';
  end if;

  insert into player_days (player_id, day_id, unlocked_at, attempts)
  values (v_player_id, p_day_id, now(), 1)
  on conflict (player_id, day_id)
  do update set unlocked_at = now(), attempts = player_days.attempts + 1;

  return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false);
end;
$$;

grant execute on function unlock_day(uuid, int, text) to anon;

-- ---------- Spieler: Antwort einreichen ------------------------------------

create or replace function submit_answer(p_token uuid, p_day_id int, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_day days%rowtype;
  v_pd player_days%rowtype;
  v_correct boolean;
  v_points int;
  v_within_bonus boolean;
begin
  select * into v_day from days where id = p_day_id;
  select * into v_pd from player_days where player_id = v_player_id and day_id = p_day_id;

  if not found or v_pd.unlocked_at is null then
    raise exception 'Dieser Tag ist noch nicht freigeschaltet.';
  end if;
  if v_pd.solved_at is not null then
    return jsonb_build_object('correct', true, 'alreadySolved', true, 'pointsAwarded', v_pd.points_awarded);
  end if;

  v_correct := trim(lower(p_answer)) = trim(lower(coalesce(v_day.puzzle_answer, '')));

  if not v_correct then
    update player_days set attempts = attempts + 1 where player_id = v_player_id and day_id = p_day_id;
    return jsonb_build_object('correct', false);
  end if;

  v_within_bonus := (extract(epoch from (now() - v_pd.unlocked_at)) <= v_day.bonus_window_seconds);
  v_points := v_day.base_points + (case when v_within_bonus then v_day.bonus_points else 0 end);

  update player_days
  set solved_at = now(), points_awarded = v_points, attempts = attempts + 1
  where player_id = v_player_id and day_id = p_day_id;

  update players set points = points + v_points where id = v_player_id;

  return jsonb_build_object('correct', true, 'alreadySolved', false, 'pointsAwarded', v_points, 'bonusApplied', v_within_bonus);
end;
$$;

grant execute on function submit_answer(uuid, int, text) to anon;

-- Für das Minigame: Punkte anhand einer serverseitig geclampten Leistungs-Kennzahl (0..1) vergeben,
-- damit Clients nicht beliebig hohe Werte einschleusen können.

create or replace function submit_minigame_result(p_token uuid, p_day_id int, p_performance numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_day days%rowtype;
  v_pd player_days%rowtype;
  v_perf numeric;
  v_points int;
  v_within_bonus boolean;
begin
  select * into v_day from days where id = p_day_id;
  select * into v_pd from player_days where player_id = v_player_id and day_id = p_day_id;

  if not found or v_pd.unlocked_at is null then
    raise exception 'Dieser Tag ist noch nicht freigeschaltet.';
  end if;
  if v_pd.solved_at is not null then
    return jsonb_build_object('correct', true, 'alreadySolved', true, 'pointsAwarded', v_pd.points_awarded);
  end if;

  -- Grober Schutz gegen direkte RPC-Aufrufe ohne echtes Spiel (z.B. über die Browser-
  -- Konsole mit p_performance=1): kein Minispiel lässt sich in unter 15 Sekunden ehrlich
  -- abschließen, das schützt nicht vor allem, hebt aber die Hürde für spontanes Abkürzen.
  if now() - v_pd.unlocked_at < interval '15 seconds' then
    raise exception 'Das ging zu schnell – bitte spiele die Aufgabe vollständig durch.';
  end if;

  v_perf := greatest(0, least(1, coalesce(p_performance, 0)));
  v_within_bonus := (extract(epoch from (now() - v_pd.unlocked_at)) <= v_day.bonus_window_seconds);
  v_points := round(v_day.base_points * v_perf) + (case when v_within_bonus and v_perf >= 0.8 then v_day.bonus_points else 0 end);

  update player_days
  set solved_at = now(), points_awarded = v_points, attempts = attempts + 1
  where player_id = v_player_id and day_id = p_day_id;

  update players set points = points + v_points where id = v_player_id;

  return jsonb_build_object('correct', true, 'alreadySolved', false, 'pointsAwarded', v_points, 'performance', v_perf);
end;
$$;

grant execute on function submit_minigame_result(uuid, int, numeric) to anon;

-- ---------- Spieler: Quiz-Fragen abrufen (Tag 1) ---------------------------
-- Liefert alle Fragen inkl. Lösung/markiertem Punkt auf einmal aus - die Prüfung
-- läuft wie beim Theorie-Quiz komplett clientseitig, das Endergebnis geht über
-- submit_minigame_result. Setzt (wie submit_answer/submit_minigame_result) voraus,
-- dass der Tag bereits freigeschaltet ist.

create or replace function get_quiz_questions(p_token uuid, p_day_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_pd player_days%rowtype;
begin
  select * into v_pd from player_days where player_id = v_player_id and day_id = p_day_id;
  if not found or v_pd.unlocked_at is null then
    raise exception 'Dieser Tag ist noch nicht freigeschaltet.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'prompt', q.prompt,
      'timeLimitSeconds', q.time_limit_seconds, 'pointsBase', q.points_base,
      'choices', q.choices, 'correctChoiceId', q.correct_choice_id,
      'imageDataUrl', q.image_data_url, 'correctX', q.correct_x, 'correctY', q.correct_y,
      'toleranceRadius', q.tolerance_radius
    ) order by q.sort_order, q.created_at)
    from quiz_questions q where q.day_id = p_day_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function get_quiz_questions(uuid, int) to anon;

-- ---------- Spieler: Materialcheck-Antwort einreichen (Tag 5) ---------------
-- Wird nicht automatisch bewertet - vergibt daher hier keine Punkte. Der Admin liest
-- die Antwort später und vergibt Punkte über admin_grade_finale_answer. Einmal bewertete
-- Antworten lassen sich nicht mehr überschreiben.

create or replace function submit_finale_material_answer(p_token uuid, p_day_id int, p_answer_text text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player_id uuid := _valid_player_session(p_token);
  v_pd player_days%rowtype;
  v_existing finale_material_answers%rowtype;
begin
  select * into v_pd from player_days where player_id = v_player_id and day_id = p_day_id;
  if not found or v_pd.unlocked_at is null then
    raise exception 'Dieser Tag ist noch nicht freigeschaltet.';
  end if;
  if coalesce(trim(p_answer_text), '') = '' then
    raise exception 'Antwort darf nicht leer sein.';
  end if;
  if length(p_answer_text) > 4000 then
    raise exception 'Antwort ist zu lang.';
  end if;

  select * into v_existing from finale_material_answers where player_id = v_player_id and day_id = p_day_id;
  if found and v_existing.graded_at is not null then
    raise exception 'Antwort wurde bereits bewertet und kann nicht mehr geändert werden.';
  end if;

  insert into finale_material_answers (player_id, day_id, answer_text)
  values (v_player_id, p_day_id, trim(p_answer_text))
  on conflict (player_id, day_id) do update set answer_text = excluded.answer_text, submitted_at = now();
end;
$$;

grant execute on function submit_finale_material_answer(uuid, int, text) to anon;

-- ---------- Öffentliche Rangliste -------------------------------------------

create or replace function get_leaderboard()
returns table(name text, points int, days_solved int)
language sql
security definer
set search_path = public, extensions
as $$
  select p.name, p.points,
         (select count(*) from player_days pd where pd.player_id = p.id and pd.solved_at is not null)::int as days_solved
  from players p
  order by p.points desc, days_solved desc, p.created_at asc
  limit 100;
$$;

grant execute on function get_leaderboard() to anon;

-- ---------- Admin ------------------------------------------------------------

create or replace function admin_login(p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_token uuid;
begin
  select password_hash into v_hash from admin_settings where id = true;
  if v_hash is null or v_hash <> crypt(p_password, v_hash) then
    perform pg_sleep(0.5); -- simple throttle gegen brute force
    raise exception 'Falsches Passwort.';
  end if;
  insert into admin_sessions default values returning token into v_token;
  return v_token;
end;
$$;

grant execute on function admin_login(text) to anon;

create or replace function admin_change_password(p_token uuid, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  if length(p_new_password) < 8 then
    raise exception 'Neues Passwort muss mindestens 8 Zeichen haben.';
  end if;
  update admin_settings set password_hash = crypt(p_new_password, gen_salt('bf')) where id = true;
end;
$$;

grant execute on function admin_change_password(uuid, text) to anon;

create or replace function admin_get_dashboard(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_days jsonb;
  v_players jsonb;
begin
  perform _valid_admin_session(p_token);

  select coalesce(jsonb_agg(
      to_jsonb(d) || jsonb_build_object(
        'quiz_question_count', (select count(*) from quiz_questions qq where qq.day_id = d.id)
      )
      order by d.sort_order
    ), '[]'::jsonb) into v_days from days d;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'points', p.points, 'createdAt', p.created_at,
      'daysSolved', (select count(*) from player_days pd where pd.player_id = p.id and pd.solved_at is not null)
    ) order by p.points desc), '[]'::jsonb) into v_players
  from players p;

  return jsonb_build_object('days', v_days, 'players', v_players);
end;
$$;

grant execute on function admin_get_dashboard(uuid) to anon;

create or replace function admin_update_day(
  p_token uuid, p_day_id int, p_title text, p_teaser text, p_code text, p_opens_at timestamptz,
  p_puzzle_type text, p_puzzle_question text, p_puzzle_choices jsonb, p_puzzle_answer text,
  p_base_points int, p_bonus_points int, p_bonus_window_seconds int,
  p_finale_material_photo text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);

  if p_puzzle_type not in ('riddle', 'choice', 'minigame', 'windsurf_sim', 'theory_exam', 'finale', 'quiz') then
    raise exception 'Ungültiger Rätseltyp.';
  end if;
  if p_code !~ '^[0-9]{4}$' then
    raise exception 'Code muss aus genau 4 Ziffern bestehen.';
  end if;
  if p_finale_material_photo is not null and length(p_finale_material_photo) > 2500000 then
    raise exception 'Bild ist zu groß (max. ca. 2,5 MB nach Kompression). Bitte kleiner hochladen.';
  end if;

  update days set
    title = p_title,
    teaser = p_teaser,
    code = p_code,
    opens_at = p_opens_at,
    puzzle_type = p_puzzle_type,
    puzzle_question = p_puzzle_question,
    puzzle_choices = p_puzzle_choices,
    puzzle_answer = p_puzzle_answer,
    base_points = p_base_points,
    bonus_points = p_bonus_points,
    bonus_window_seconds = p_bonus_window_seconds,
    finale_material_photo = p_finale_material_photo,
    updated_at = now()
  where id = p_day_id;
end;
$$;

grant execute on function admin_update_day(uuid, int, text, text, text, timestamptz, text, text, jsonb, text, int, int, int, text) to anon;

create or replace function admin_reset_player(p_token uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  delete from player_days where player_id = p_player_id;
  update players set points = 0 where id = p_player_id;
end;
$$;

grant execute on function admin_reset_player(uuid, uuid) to anon;

create or replace function admin_delete_player(p_token uuid, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  delete from players where id = p_player_id;
end;
$$;

grant execute on function admin_delete_player(uuid, uuid) to anon;

-- ---------- Admin: Quiz-Fragen verwalten (Tag 1) ----------------------------

create or replace function admin_list_quiz_questions(p_token uuid, p_day_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.sort_order, q.created_at)
    from quiz_questions q where q.day_id = p_day_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function admin_list_quiz_questions(uuid, int) to anon;

-- Legt eine neue Frage an (p_question_id = null) oder aktualisiert eine bestehende.
-- Die zum jeweiligen Fragetyp nicht passenden Felder werden serverseitig auf null
-- gesetzt, damit z. B. ein Wechsel von 'point' auf 'choice' keine verwaisten
-- Bild-/Punktdaten zurücklässt.
create or replace function admin_upsert_quiz_question(
  p_token uuid, p_question_id uuid, p_day_id int, p_sort_order int,
  p_kind text, p_prompt text, p_time_limit_seconds int, p_points_base int,
  p_choices jsonb, p_correct_choice_id text,
  p_image_data_url text, p_correct_x numeric, p_correct_y numeric, p_tolerance_radius numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  perform _valid_admin_session(p_token);

  if p_kind not in ('choice', 'point') then
    raise exception 'Ungültiger Fragetyp.';
  end if;
  if coalesce(trim(p_prompt), '') = '' then
    raise exception 'Frage darf nicht leer sein.';
  end if;
  if p_time_limit_seconds is null or p_time_limit_seconds < 3 or p_time_limit_seconds > 600 then
    raise exception 'Zeitlimit muss zwischen 3 und 600 Sekunden liegen.';
  end if;
  if p_points_base is null or p_points_base < 0 then
    raise exception 'Basispunkte dürfen nicht negativ sein.';
  end if;

  if p_kind = 'choice' then
    if p_choices is null or jsonb_array_length(p_choices) < 2 then
      raise exception 'Mindestens 2 Auswahlmöglichkeiten nötig.';
    end if;
    if p_correct_choice_id is null or not exists (
      select 1 from jsonb_array_elements(p_choices) c where c->>'id' = p_correct_choice_id
    ) then
      raise exception 'Richtige Auswahl-ID muss zu einer Auswahlmöglichkeit passen.';
    end if;
  else
    if p_image_data_url is null or p_correct_x is null or p_correct_y is null then
      raise exception 'Bild und markierter Punkt sind erforderlich.';
    end if;
    if p_correct_x < 0 or p_correct_x > 1 or p_correct_y < 0 or p_correct_y > 1 then
      raise exception 'Punkt-Koordinaten müssen zwischen 0 und 1 liegen.';
    end if;
    if length(p_image_data_url) > 2500000 then
      raise exception 'Bild ist zu groß (max. ca. 2,5 MB nach Kompression). Bitte kleiner hochladen.';
    end if;
  end if;

  if p_question_id is null then
    insert into quiz_questions (
      day_id, sort_order, kind, prompt, time_limit_seconds, points_base,
      choices, correct_choice_id, image_data_url, correct_x, correct_y, tolerance_radius
    )
    values (
      p_day_id, p_sort_order, p_kind, trim(p_prompt), p_time_limit_seconds, p_points_base,
      case when p_kind = 'choice' then p_choices else null end,
      case when p_kind = 'choice' then p_correct_choice_id else null end,
      case when p_kind = 'point' then p_image_data_url else null end,
      case when p_kind = 'point' then p_correct_x else null end,
      case when p_kind = 'point' then p_correct_y else null end,
      coalesce(p_tolerance_radius, 0.08)
    )
    returning id into v_id;
  else
    update quiz_questions set
      sort_order = p_sort_order,
      kind = p_kind,
      prompt = trim(p_prompt),
      time_limit_seconds = p_time_limit_seconds,
      points_base = p_points_base,
      choices = case when p_kind = 'choice' then p_choices else null end,
      correct_choice_id = case when p_kind = 'choice' then p_correct_choice_id else null end,
      image_data_url = case when p_kind = 'point' then p_image_data_url else null end,
      correct_x = case when p_kind = 'point' then p_correct_x else null end,
      correct_y = case when p_kind = 'point' then p_correct_y else null end,
      tolerance_radius = coalesce(p_tolerance_radius, 0.08),
      updated_at = now()
    where id = p_question_id and day_id = p_day_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Frage nicht gefunden.';
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function admin_upsert_quiz_question(uuid, uuid, int, int, text, text, int, int, jsonb, text, text, numeric, numeric, numeric) to anon;

create or replace function admin_delete_quiz_question(p_token uuid, p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  delete from quiz_questions where id = p_question_id;
end;
$$;

grant execute on function admin_delete_quiz_question(uuid, uuid) to anon;

-- ---------- Admin: Materialcheck-Antworten bewerten (Tag 5) -----------------

create or replace function admin_list_finale_answers(p_token uuid, p_day_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform _valid_admin_session(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'playerId', a.player_id, 'playerName', p.name,
      'answerText', a.answer_text, 'submittedAt', a.submitted_at,
      'gradePoints', a.grade_points, 'gradedAt', a.graded_at
    ) order by a.submitted_at)
    from finale_material_answers a
    join players p on p.id = a.player_id
    where a.day_id = p_day_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function admin_list_finale_answers(uuid, int) to anon;

-- Vergibt (oder korrigiert) die Punkte für eine Materialcheck-Antwort. Rechnet die
-- Differenz zur vorherigen Bewertung auf players.points an, damit ein erneutes
-- Bewerten (z. B. Korrektur) nicht doppelt zählt.
create or replace function admin_grade_finale_answer(p_token uuid, p_answer_id uuid, p_grade_points int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_answer finale_material_answers%rowtype;
  v_delta int;
begin
  perform _valid_admin_session(p_token);
  if p_grade_points is null or p_grade_points < 0 then
    raise exception 'Punkte dürfen nicht negativ sein.';
  end if;

  select * into v_answer from finale_material_answers where id = p_answer_id;
  if not found then
    raise exception 'Antwort nicht gefunden.';
  end if;

  v_delta := p_grade_points - coalesce(v_answer.grade_points, 0);

  update finale_material_answers set grade_points = p_grade_points, graded_at = now() where id = p_answer_id;
  update players set points = points + v_delta where id = v_answer.player_id;
end;
$$;

grant execute on function admin_grade_finale_answer(uuid, uuid, int) to anon;

-- Löscht eine Materialcheck-Antwort komplett (z.B. Fehleingabe, Testdaten). War sie
-- bereits bewertet, werden die dafür vergebenen Punkte zuerst vom Spielerkonto wieder
-- abgezogen, damit keine verwaisten Punkte übrig bleiben.
create or replace function admin_delete_finale_answer(p_token uuid, p_answer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_answer finale_material_answers%rowtype;
begin
  perform _valid_admin_session(p_token);

  select * into v_answer from finale_material_answers where id = p_answer_id;
  if not found then
    raise exception 'Antwort nicht gefunden.';
  end if;

  if v_answer.grade_points is not null then
    update players set points = points - v_answer.grade_points where id = v_answer.player_id;
  end if;

  delete from finale_material_answers where id = p_answer_id;
end;
$$;

grant execute on function admin_delete_finale_answer(uuid, uuid) to anon;
