-- Run once in the Supabase SQL Editor. No existing Python tables are modified.
-- Only viabil_api and viabil_ready are exposed; all data tables live in a private schema.
begin;
create schema if not exists viabil_private;
revoke all on schema viabil_private from public, anon, authenticated;

create table if not exists viabil_private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, name text not null check (length(name) between 2 and 100),
  role text not null default 'user' check (role in ('user','super_admin')),
  account_status text not null default 'pending' check (account_status in ('pending','approved','rejected')),
  avatar text, balance integer not null default 0 check (balance between 0 and 1000000),
  reviewed_by uuid references viabil_private.profiles(id), reviewed_at bigint,
  created_at bigint not null, updated_at bigint not null, last_seen_at bigint not null
);
create table if not exists viabil_private.studies (
  user_id uuid not null references viabil_private.profiles(id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  payload jsonb not null, identity jsonb not null,
  updated_at bigint not null, last_opened_at bigint,
  primary key (user_id,id)
);
create table if not exists viabil_private.ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references viabil_private.profiles(id) on delete cascade,
  actor_id uuid not null references viabil_private.profiles(id),
  kind text not null check (kind in ('grant','use')), operation_key text not null,
  delta integer not null, balance_after integer not null, note text not null default '', created_at bigint not null,
  unique(user_id,kind,operation_key)
);
create table if not exists viabil_private.documents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references viabil_private.profiles(id) on delete cascade,
  scope text not null check(scope in ('library','lot')), lot_id text, lot_name text,
  title text not null, issuer text not null, reference text not null default '', category text not null,
  source_url text not null default '', notes text not null default '', filename text not null,
  size integer not null check(size between 12 and 10485760), sha256 text not null,
  pdf bytea not null, created_at bigint not null,
  check ((scope='library' and lot_id is null) or (scope='lot' and lot_id is not null))
);
create unique index if not exists viabil_document_duplicate on viabil_private.documents(user_id,scope,coalesce(lot_id,''),sha256);
create index if not exists viabil_document_listing on viabil_private.documents(created_at desc);
create table if not exists viabil_private.rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  count integer not null, expires_at bigint not null
);
alter table viabil_private.profiles enable row level security;
alter table viabil_private.studies enable row level security;
alter table viabil_private.ledger enable row level security;
alter table viabil_private.documents enable row level security;
alter table viabil_private.rate_limits enable row level security;
revoke all on all tables in schema viabil_private from public,anon,authenticated;

create or replace function viabil_private.fail(status integer, message text, code text default null)
returns void language plpgsql set search_path='' as $$
begin
  raise exception using errcode='P0001', message=message,
    detail=jsonb_build_object('status',status,'code',code)::text;
end $$;
create or replace function viabil_private.field(value jsonb, maximum integer, minimum integer default 0)
returns text language plpgsql immutable set search_path='' as $$
declare result text;
begin
  if jsonb_typeof(value) is distinct from 'string' then perform viabil_private.fail(400,'Confira os campos enviados.'); end if;
  result := btrim(value #>> '{}');
  if length(result)<minimum or length(result)>maximum then perform viabil_private.fail(400,'Confira os campos enviados.'); end if;
  return result;
end $$;
create or replace function viabil_private.number(value jsonb, minimum numeric, maximum numeric)
returns numeric language plpgsql immutable set search_path='' as $$
declare result numeric;
begin
  if jsonb_typeof(value) is distinct from 'number' then perform viabil_private.fail(400,'Confira os valores numéricos.'); end if;
  result := (value #>> '{}')::numeric;
  if result<minimum or result>maximum then perform viabil_private.fail(400,'Confira os valores numéricos.'); end if;
  return result;
end $$;
create or replace function viabil_private.rounded(value jsonb, precision_digits integer)
returns jsonb language sql immutable set search_path='' as $$
  select case when jsonb_typeof(value)='number'
    then to_jsonb(floor((value #>> '{}')::numeric * power(10::numeric,precision_digits)+0.5) / power(10::numeric,precision_digits))
    else 'null'::jsonb end
$$;
create or replace function viabil_private.identity(lot jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare geometry jsonb := nullif(lot->'geometry','null'); coordinates jsonb; points jsonb; digits integer;
begin
  coordinates := coalesce(nullif(geometry->'geographic','null'),nullif(geometry->'metricCoordinates','null'),geometry->'vertices');
  digits := case when nullif(geometry->'geographic','null') is not null then 7 else 4 end;
  if coordinates is not null then
    select jsonb_agg(jsonb_build_array(viabil_private.rounded(p->0,digits),viabil_private.rounded(p->1,digits)) order by ordinal)
      into points from jsonb_array_elements(coordinates) with ordinality as item(p,ordinal);
  end if;
  return jsonb_build_object('area',viabil_private.rounded(lot->'area',2),
    'width',case when geometry is null then viabil_private.rounded(lot->'width',3) else 'null'::jsonb end,
    'depth',case when geometry is null then viabil_private.rounded(lot->'depth',3) else 'null'::jsonb end,
    'lat',viabil_private.rounded(lot->'lat',7),'lng',viabil_private.rounded(lot->'lng',7),'coordinates',points,
    'crs',case when geometry is null then null when nullif(geometry->'geographic','null') is not null then 'EPSG:4326' else coalesce(nullif(geometry->>'crs',''),'local') end);
end $$;
create or replace function viabil_private.validate_study(identifier text, data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare lot jsonb:=data->'lot'; scenario jsonb:=data->'scenario'; key text; point jsonb; points jsonb; value numeric;
begin
  if identifier is null or identifier !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(lot) is distinct from 'object'
    or lot->>'id' is distinct from identifier or jsonb_typeof(scenario) is distinct from 'object' then
    perform viabil_private.fail(400,'Terreno ou cenário inválido.');
  end if;
  perform viabil_private.field(lot->'name',120,1);
  value:=viabil_private.number(lot->'area',0,1000000);
  if value=0 then perform viabil_private.fail(400,'Área inválida.'); end if;
  foreach key in array array['width','depth'] loop
    value:=viabil_private.number(lot->key,0,20000);
    if value=0 then perform viabil_private.fail(400,'Dimensões inválidas.'); end if;
  end loop;
  foreach key in array array['lat','lng'] loop
    if nullif(lot->key,'null') is not null then
      perform viabil_private.number(lot->key,case when key='lat' then -90 else -180 end,case when key='lat' then 90 else 180 end);
    end if;
  end loop;
  if nullif(lot->'geometry','null') is not null then
    if jsonb_typeof(lot->'geometry') is distinct from 'object' or jsonb_typeof(lot#>'{geometry,vertices}') is distinct from 'array' then
      perform viabil_private.fail(400,'Geometria inválida.');
    end if;
    foreach key in array array['vertices','geographic','metricCoordinates'] loop
      points:=nullif(lot->'geometry'->key,'null');
      if points is not null then
        if jsonb_typeof(points) is distinct from 'array' then perform viabil_private.fail(400,'Geometria inválida.'); end if;
        if jsonb_array_length(points)<3 or jsonb_array_length(points)>(case when key='vertices' then 120 else 121 end) then
          perform viabil_private.fail(400,'Geometria inválida.');
        end if;
        for point in select * from jsonb_array_elements(points) loop
          if jsonb_typeof(point) is distinct from 'array' then perform viabil_private.fail(400,'Coordenadas inválidas.'); end if;
          if jsonb_array_length(point)<>2 then perform viabil_private.fail(400,'Coordenadas inválidas.'); end if;
          perform viabil_private.number(point->0,-1e15,1e15); perform viabil_private.number(point->1,-1e15,1e15);
        end loop;
      end if;
    end loop;
    if nullif(lot#>'{geometry,crs}','null') is not null then perform viabil_private.field(lot#>'{geometry,crs}',100,1); end if;
  end if;
  foreach key in array array['floors','to','efficiency','unitArea','price','cost','landPrice','indirect','profit'] loop
    perform viabil_private.number(scenario->key,0,1e12);
  end loop;
  value:=(scenario->>'floors')::numeric;
  if value<>floor(value) or value<1 or value>80 or (scenario->>'unitArea')::numeric<=0
    or (scenario->>'efficiency')::numeric<=0 or (scenario->>'efficiency')::numeric>100 or (scenario->>'to')::numeric>100
    or coalesce(scenario->>'use','') not in ('H1','H3','Comercial','Flats','Misto') then perform viabil_private.fail(400,'Cenário inválido.'); end if;
  data:=jsonb_build_object('lot',lot,'scenario',scenario,'polygon',data->'polygon','draft',data->'draft','context',data->'context');
  if octet_length(data::text)>150000 then perform viabil_private.fail(413,'Este estudo excede o tamanho permitido.'); end if;
  return data;
end $$;
create or replace function viabil_private.usage(profile viabil_private.profiles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('unlimited',profile.role='super_admin','balance',profile.balance,
    'used',(select count(*) from viabil_private.ledger where user_id=profile.id and kind='use'))
$$;
create or replace function viabil_private.public_user(profile viabil_private.profiles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',profile.id,'email',profile.email,'name',profile.name,'role',profile.role,
    'accountStatus',profile.account_status,'googleConnected',exists(select 1 from auth.identities where user_id=profile.id and provider='google'),'hasPassword',exists(select 1 from auth.identities where user_id=profile.id and provider='email'),'avatar',profile.avatar,
    'usage',case when profile.account_status='approved' then viabil_private.usage(profile) else '{"unlimited":false,"balance":0,"used":0}'::jsonb end)
$$;
create or replace function viabil_private.document_json(document viabil_private.documents)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',document.id,'ownerId',document.user_id,
    'ownerName',(select name from viabil_private.profiles where id=document.user_id),
    'scope',document.scope,'lotId',document.lot_id,'lotName',document.lot_name,
    'title',document.title,'issuer',document.issuer,'reference',document.reference,'category',document.category,
    'sourceURL',document.source_url,'notes',document.notes,'filename',document.filename,'size',document.size,
    'sha256',document.sha256,'createdAt',document.created_at,'url','/api/documents/'||document.id||'/file','status','registered')
$$;

create or replace function public.viabil_api(operation text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); profile viabil_private.profiles; target viabil_private.profiles;
  identity_user auth.users; study viabil_private.studies; document viabil_private.documents;
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000); result jsonb; items jsonb;
  identifier text:=payload->>'id'; data jsonb; identity_value jsonb; charged boolean:=false; duplicate boolean:=false;
  op_key text; amount integer; previous integer; total bigint; bytes_total bigint; raw bytea; hash text;
  page integer; lot_filter text; filename text; source_url text; image text; rate_count integer;
  title text; issuer text; reference_text text; notes text; error_detail text;
begin
  if operation='ready' then return jsonb_build_object('status','ready'); end if;
  if uid is null then return jsonb_build_object('error','Entre na sua conta para continuar.','status',401); end if;
  select * into identity_user from auth.users where id=uid;
  if not found or identity_user.email_confirmed_at is null or identity_user.email is null then
    return jsonb_build_object('error','Solicite ao administrador a validação da sua conta.','status',403);
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>15728640 then return jsonb_build_object('error','Dados acima do limite.','status',413); end if;
  -- Per-account limit also applies to direct RPC clients, not just the Pages interface.
  insert into viabil_private.rate_limits values(uid,1,stamp+900000)
    on conflict(user_id) do update set count=case when viabil_private.rate_limits.expires_at>stamp then viabil_private.rate_limits.count+1 else 1 end,
      expires_at=case when viabil_private.rate_limits.expires_at>stamp then viabil_private.rate_limits.expires_at else stamp+900000 end
    returning count into rate_count;
  if rate_count>600 then return jsonb_build_object('error','Muitas tentativas. Aguarde alguns minutos.','status',429); end if;
  -- The identity, email and initial name come from Supabase Auth, never from the request payload.
  insert into viabil_private.profiles(id,email,name,created_at,updated_at,last_seen_at)
    values(uid,identity_user.email,
      left(coalesce(nullif(btrim(identity_user.raw_user_meta_data->>'full_name'),''),nullif(split_part(identity_user.email,'@',1),''),'Usuário')||' ',100),stamp,stamp,stamp)
    on conflict(id) do update set email=excluded.email,last_seen_at=stamp;
  select * into profile from viabil_private.profiles where id=uid for update;
  -- Keep rate accounting outside the mutation subtransaction so rejected requests
  -- still count, while a failed save rolls back its credit debit and document writes.
  begin
  if operation='session' then return jsonb_build_object('user',viabil_private.public_user(profile)); end if;
  if profile.account_status<>'approved' then
    perform viabil_private.fail(403,case when profile.account_status='pending' then 'Seu cadastro aguarda aprovação do administrador.' else 'Seu cadastro não foi aprovado.' end,
      case when profile.account_status='pending' then 'ACCOUNT_PENDING' else 'ACCOUNT_REJECTED' end);
  end if;
  if operation in ('overview','review','credits') and profile.role<>'super_admin' then perform viabil_private.fail(403,'Este recurso exige acesso de superadministrador.'); end if;

  case operation
  when 'usage' then return jsonb_build_object('usage',viabil_private.usage(profile));
  when 'profile' then
    update viabil_private.profiles set name=viabil_private.field(payload->'name',100,2),updated_at=stamp where id=uid returning * into profile;
    return jsonb_build_object('user',viabil_private.public_user(profile));
  when 'photo' then
    if payload->'image'='null' then image:=null;
    else image:=viabil_private.field(payload->'image',610000);
      if image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' then perform viabil_private.fail(400,'Selecione uma imagem PNG, JPEG ou WebP.'); end if;
    end if;
    if image is not null then
      raw:=decode(split_part(image,',',2),'base64');
      if octet_length(raw)<12 or octet_length(raw)>450000 or not (
        (image like 'data:image/jpeg;%' and substring(raw from 1 for 3)=decode('ffd8ff','hex')) or
        (image like 'data:image/png;%' and substring(raw from 1 for 8)=decode('89504e470d0a1a0a','hex')) or
        (image like 'data:image/webp;%' and substring(raw from 1 for 4)=convert_to('RIFF','UTF8') and substring(raw from 9 for 4)=convert_to('WEBP','UTF8'))
      ) then perform viabil_private.fail(400,'Imagem inválida ou acima de 450 KB.'); end if;
    end if;
    update viabil_private.profiles set avatar=image,updated_at=stamp where id=uid returning * into profile;
    return jsonb_build_object('user',viabil_private.public_user(profile));
  when 'studies' then
    select coalesce(jsonb_agg(s.payload||jsonb_build_object('updatedAt',s.updated_at,'lastOpenedAt',s.last_opened_at)
      order by greatest(s.updated_at,coalesce(s.last_opened_at,0)) desc,s.updated_at desc,s.id),'[]') into items
      from viabil_private.studies s where s.user_id=uid;
    return jsonb_build_object('studies',items);
  when 'study','open-study','save-study','delete-study' then
    if identifier is null or identifier !~ '^[a-zA-Z0-9_-]{1,80}$' then perform viabil_private.fail(400,'Identificação do estudo inválida.'); end if;
    select * into study from viabil_private.studies where user_id=uid and id=identifier;
    if operation='save-study' then
      data:=viabil_private.validate_study(identifier,payload); identity_value:=viabil_private.identity(data->'lot');
      if study.id is null and (select count(*) from viabil_private.studies where user_id=uid)>=500 then perform viabil_private.fail(409,'Sua conta atingiu o limite de 500 estudos.'); end if;
      op_key:='study:'||identifier||':'||md5(identity_value::text);
      if profile.role<>'super_admin' and (study.id is null or study.identity<>identity_value) and not exists(
        select 1 from viabil_private.ledger l where l.user_id=uid and l.kind='use' and l.operation_key=op_key) then
        if profile.balance<1 then perform viabil_private.fail(409,'Seus usos acabaram. Solicite uma nova liberação.','NO_CREDITS'); end if;
        update viabil_private.profiles set balance=balance-1 where id=uid returning * into profile;
        insert into viabil_private.ledger(user_id,actor_id,kind,operation_key,delta,balance_after,note,created_at)
          values(uid,uid,'use',op_key,-1,profile.balance,'Orçamento gerado',stamp); charged:=true;
      end if;
      insert into viabil_private.studies(user_id,id,payload,identity,updated_at) values(uid,identifier,data,identity_value,stamp)
        on conflict(user_id,id) do update set payload=excluded.payload,identity=excluded.identity,updated_at=excluded.updated_at returning * into study;
      return jsonb_build_object('study',study.payload||jsonb_build_object('updatedAt',study.updated_at,'lastOpenedAt',study.last_opened_at),
        'usage',viabil_private.usage(profile),'charged',charged);
    end if;
    if study.id is null then perform viabil_private.fail(404,'Estudo não encontrado na sua conta.'); end if;
    if operation='delete-study' then
      delete from viabil_private.documents where user_id=uid and scope='lot' and lot_id=identifier;
      delete from viabil_private.studies where user_id=uid and id=identifier; return '{"ok":true}';
    elsif operation='open-study' then
      update viabil_private.studies set last_opened_at=stamp where user_id=uid and id=identifier;
      return jsonb_build_object('updatedAt',study.updated_at,'lastOpenedAt',stamp);
    end if;
    return jsonb_build_object('study',study.payload||jsonb_build_object('updatedAt',study.updated_at,'lastOpenedAt',study.last_opened_at));
  when 'overview' then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.name,'role',p.role,
      'accountStatus',p.account_status,'createdAt',p.created_at,'reviewedAt',p.reviewed_at,
      'reviewerName',(select name from viabil_private.profiles where id=p.reviewed_by),
      'studyCount',(select count(*) from viabil_private.studies where user_id=p.id),
      'creditBalance',p.balance,'usedCredits',(select count(*) from viabil_private.ledger where user_id=p.id and kind='use')) order by p.created_at desc,p.id),'[]')
      into items from (select * from viabil_private.profiles order by created_at desc,id limit 100) p;
    select jsonb_build_object('totals',jsonb_build_object('users',count(*),'superAdmins',count(*) filter(where role='super_admin'),
      'pendingUsers',count(*) filter(where account_status='pending'),'activeSessions',count(*) filter(where last_seen_at>stamp-1800000),
      'sessionLabel','CONTAS RECENTES','sessionDescription','Contas com atividade nos últimos 30 minutos',
      'studies',(select count(*) from viabil_private.studies)),'users',items) into result from viabil_private.profiles;
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',p.email,'name',p.name,'role',p.role,'createdAt',p.created_at) order by p.created_at,p.id),'[]')
      into items from (select * from viabil_private.profiles where account_status='pending' order by created_at,id limit 100) p;
    result:=result||jsonb_build_object('pendingUsers',items);
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.payload#>>'{lot,name}','updatedAt',s.updated_at,
      'ownerName',p.name,'ownerEmail',p.email) order by s.updated_at desc,s.user_id,s.id),'[]') into items
      from (select * from viabil_private.studies order by updated_at desc,user_id,id limit 20) s join viabil_private.profiles p on p.id=s.user_id;
    return result||jsonb_build_object('recentStudies',items);
  when 'review','credits' then
    select * into target from viabil_private.profiles where id=identifier::uuid for update;
    if not found then perform viabil_private.fail(404,'Conta não encontrada.'); end if;
    if operation='review' then
      if target.id=uid then perform viabil_private.fail(400,'Você não pode validar o próprio cadastro.'); end if;
      if coalesce(payload->>'decision','') not in ('approved','rejected') then perform viabil_private.fail(400,'Escolha aprovar ou recusar.'); end if;
      if target.account_status<>'pending' then perform viabil_private.fail(409,'Este cadastro já foi analisado. Atualize a lista.'); end if;
      update viabil_private.profiles set account_status=payload->>'decision',reviewed_by=uid,reviewed_at=stamp,updated_at=stamp where id=target.id returning * into target;
      return jsonb_build_object('user',viabil_private.public_user(target));
    end if;
    if target.account_status<>'approved' then perform viabil_private.fail(403,'A conta precisa estar aprovada para utilizar créditos.'); end if;
    if target.role='super_admin' then perform viabil_private.fail(400,'O superadministrador já possui uso sem limite.'); end if;
    amount:=viabil_private.number(payload->'amount',1,1000)::integer;
    if (payload->>'amount')::numeric<>amount then perform viabil_private.fail(400,'Informe uma quantidade inteira de créditos.'); end if;
    op_key:=viabil_private.field(payload->'requestKey',180,1);
    if op_key !~ '^[a-zA-Z0-9:_-]+$' then perform viabil_private.fail(400,'Identificação da operação inválida.'); end if;
    notes:=viabil_private.field(coalesce(payload->'note','""'::jsonb),250);
    select l.delta into previous from viabil_private.ledger l where user_id=target.id and kind='grant' and l.operation_key=op_key;
    if found then
      if previous<>amount then perform viabil_private.fail(409,'Esta operação já foi utilizada para outra quantidade de créditos.'); end if;
      duplicate:=true;
    else
      if target.balance+amount>1000000 then perform viabil_private.fail(409,'Saldo máximo atingido.'); end if;
      update viabil_private.profiles set balance=balance+amount where id=target.id returning * into target;
      insert into viabil_private.ledger(user_id,actor_id,kind,operation_key,delta,balance_after,note,created_at)
        values(target.id,uid,'grant',op_key,amount,target.balance,notes,stamp);
    end if;
    return jsonb_build_object('usage',viabil_private.usage(target)||jsonb_build_object('duplicate',duplicate));
  when 'documents' then
    if coalesce(payload->>'page','0') !~ '^\d{1,5}$' then perform viabil_private.fail(400,'Página inválida.'); end if;
    page:=coalesce(payload->>'page','0')::integer; lot_filter:=coalesce(payload->>'lotId','');
    if lot_filter<>'' and lot_filter !~ '^[a-zA-Z0-9_-]{1,80}$' then perform viabil_private.fail(400,'Terreno inválido.'); end if;
    select count(*) into total from viabil_private.documents d where (profile.role='super_admin' or d.scope='library' or d.user_id=uid)
      and (lot_filter='' or d.scope='library' or (d.user_id=uid and d.lot_id=lot_filter));
    select coalesce(jsonb_agg(viabil_private.document_json(d) order by d.created_at desc,d.id),'[]') into items from (
      select * from viabil_private.documents d where (profile.role='super_admin' or d.scope='library' or d.user_id=uid)
      and (lot_filter='' or d.scope='library' or (d.user_id=uid and d.lot_id=lot_filter)) order by d.created_at desc,d.id limit 25 offset page*25) d;
    return jsonb_build_object('documents',items,'total',total,'page',page,'pageSize',25);
  when 'add-document' then
    if coalesce(payload->>'scope','') not in ('library','lot') then perform viabil_private.fail(400,'Selecione o destino do documento.'); end if;
    if payload->>'scope'='library' and profile.role<>'super_admin' then perform viabil_private.fail(403,'Somente o administrador pode cadastrar legislação geral.'); end if;
    title:=viabil_private.field(payload->'title',160,1); issuer:=viabil_private.field(payload->'issuer',160,1);
    reference_text:=viabil_private.field(coalesce(payload->'reference','""'::jsonb),250);
    notes:=viabil_private.field(coalesce(payload->'notes','""'::jsonb),1500);
    filename:=regexp_replace(viabil_private.field(payload->'filename',180,1),'^.*[/\\]','');
    source_url:=viabil_private.field(coalesce(payload->'sourceURL','""'::jsonb),1500);
    if filename !~* '\.pdf$' or coalesce(payload->>'category','') not in ('legislacao','certidao','planta','matricula','outro') then perform viabil_private.fail(400,'Selecione a categoria e um arquivo PDF.'); end if;
    if source_url<>'' and source_url !~ '^https?://[^/@\s:]+(:[0-9]+)?([/?#][^\s]*)?$' then perform viabil_private.fail(400,'Informe um link HTTP ou HTTPS válido.'); end if;
    if payload->>'scope'='lot' then
      select * into study from viabil_private.studies where user_id=uid and id=viabil_api.payload->>'lotId';
      if not found then perform viabil_private.fail(404,'Salve o estudo na sua conta antes de anexar documentos.'); end if;
    end if;
    if jsonb_typeof(payload->'pdf') is distinct from 'string' or length(payload->>'pdf')>13981016 then perform viabil_private.fail(413,'Use um PDF de até 10 MB.'); end if;
    if payload->>'pdf' !~ '^[A-Za-z0-9+/]+={0,2}$' then perform viabil_private.fail(400,'PDF inválido.'); end if;
    raw:=decode(payload->>'pdf','base64');
    if octet_length(raw)>10485760 then perform viabil_private.fail(413,'Use um PDF de até 10 MB.'); end if;
    if substring(raw from 1 for 5)<>convert_to('%PDF-','UTF8') or position(convert_to('%%EOF','UTF8') in substring(raw from greatest(1,octet_length(raw)-2047)))=0 then
      perform viabil_private.fail(400,'O arquivo não possui a estrutura esperada de um PDF.'); end if;
    select count(*),coalesce(sum(size),0) into total,bytes_total from viabil_private.documents where user_id=uid;
    if total>=100 or bytes_total+octet_length(raw)>104857600 then perform viabil_private.fail(409,'Limite de 100 documentos ou 100 MB atingido.'); end if;
    hash:=encode(sha256(raw),'hex');
    insert into viabil_private.documents(user_id,scope,lot_id,lot_name,title,issuer,reference,category,source_url,notes,filename,size,sha256,pdf,created_at)
      values(uid,payload->>'scope',study.id,study.payload#>>'{lot,name}',title,issuer,reference_text,payload->>'category',source_url,notes,filename,octet_length(raw),hash,raw,stamp)
      returning * into document;
    return jsonb_build_object('document',viabil_private.document_json(document));
  when 'file','delete-document' then
    select * into document from viabil_private.documents d where id=identifier::uuid and
      (profile.role='super_admin' or d.user_id=uid or (operation='file' and d.scope='library'));
    if not found then perform viabil_private.fail(404,'Documento não encontrado ou sem acesso.'); end if;
    if operation='delete-document' then delete from viabil_private.documents where id=document.id; return '{"ok":true}'; end if;
    return jsonb_build_object('pdf',encode(document.pdf,'base64'),'filename',document.filename);
  else perform viabil_private.fail(404,'Recurso não encontrado.');
  end case;
  return '{}';
exception
  when sqlstate 'P0001' then
    get stacked diagnostics error_detail=pg_exception_detail;
    return jsonb_build_object('error',sqlerrm)||error_detail::jsonb;
  when unique_violation then return jsonb_build_object('error','Este registro já existe neste destino.','status',409);
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    return jsonb_build_object('error','Confira os dados enviados.','status',400);
  end;
end $$;

-- Explicit grants: no SQL helper or private table can be invoked/read directly.
revoke all on all functions in schema viabil_private from public,anon,authenticated;
revoke all on function public.viabil_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.viabil_api(text,jsonb) to authenticated;
-- Anonymous readiness has its own zero-argument function, never the general dispatcher.
create or replace function public.viabil_ready() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('status',case when to_regclass('viabil_private.profiles') is not null then 'ready' else 'unavailable' end)
$$;
revoke all on function public.viabil_ready() from public;
grant execute on function public.viabil_ready() to anon,authenticated;
notify pgrst, 'reload schema';
commit;
