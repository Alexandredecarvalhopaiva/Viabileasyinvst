-- Apply after 202610300001_pages.sql. Existing accounts and balances are retained.
begin;
alter table viabil_private.profiles add column if not exists disabled_at bigint;
alter table viabil_private.profiles add column if not exists credentials_defined boolean not null default true;
alter table viabil_private.profiles add column if not exists email_verified boolean;
alter table viabil_private.profiles add column if not exists creation_key text unique;
create table if not exists viabil_private.account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references viabil_private.profiles(id),
  actor_id uuid not null references viabil_private.profiles(id),
  action text not null, operation_key text not null, note text not null, created_at bigint not null,
  unique(user_id,operation_key)
);
create table if not exists viabil_private.access_links (
  hash text primary key check(hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null unique references viabil_private.profiles(id),
  actor_id uuid not null references viabil_private.profiles(id),
  expires_at bigint not null, consumed_at bigint, completed_at bigint
);
alter table viabil_private.account_events enable row level security;
alter table viabil_private.access_links enable row level security;
revoke all on viabil_private.account_events,viabil_private.access_links from public,anon,authenticated;

-- Keep the original dispatcher intact and private, including study/debit atomicity.
do $$ begin
  if to_regprocedure('viabil_private.viabil_api(text,jsonb)') is null then
    alter function public.viabil_api(text,jsonb) set schema viabil_private;
  end if;
end $$;
revoke all on function viabil_private.viabil_api(text,jsonb) from public,anon,authenticated;

create or replace function viabil_private.public_user(profile viabil_private.profiles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',profile.id,'email',profile.email,'name',profile.name,'role',profile.role,
    'accountStatus',case when profile.disabled_at is not null then 'blocked' else profile.account_status end,
    'googleConnected',exists(select 1 from auth.identities where user_id=profile.id and provider='google'),
    'hasPassword',profile.credentials_defined and exists(select 1 from auth.identities where user_id=profile.id and provider='email'),
    'emailVerified',coalesce(profile.email_verified,(select email_confirmed_at is not null from auth.users where id=profile.id)),
    'avatar',profile.avatar,'usage',case when profile.account_status='approved' and profile.disabled_at is null
      then viabil_private.usage(profile) else '{"unlimited":false,"balance":0,"used":0}'::jsonb end)
$$;

create or replace function public.viabil_api(operation text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); profile viabil_private.profiles; target viabil_private.profiles;
  previous viabil_private.account_events; result jsonb; entry jsonb; items jsonb:='[]';
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000);
  op_key text; note text; action text; blocked boolean; details text;
begin
  -- A JWT alone survives provider logout. Check its backing session on every RPC.
  if uid is null or not exists(select 1 from auth.sessions where user_id=uid and id=(auth.jwt()->>'session_id')::uuid) then
    return jsonb_build_object('error','Sua sessão terminou. Entre novamente.','status',401);
  end if;
  if not exists(select 1 from auth.users where id=uid and email is not null and email_confirmed_at is not null) then
    return jsonb_build_object('error','Solicite ao administrador a validação da sua conta.','status',403);
  end if;
  select * into profile from viabil_private.profiles where id=uid for update;
  if found then
    if profile.disabled_at is not null then perform viabil_private.fail(403,'Seu acesso foi bloqueado. Fale com o administrador.','ACCOUNT_BLOCKED'); end if;
    if not profile.credentials_defined then perform viabil_private.fail(403,'Defina sua senha pelo link de acesso.','PASSWORD_REQUIRED'); end if;
    if operation<>'session' and profile.account_status<>'approved' then
      perform viabil_private.fail(403,'Seu cadastro aguarda decisão do administrador.',
        case when profile.account_status='pending' then 'ACCOUNT_PENDING' else 'ACCOUNT_REJECTED' end);
    end if;
  end if;
  if operation in ('account-admin','status','review','credits') then
    if profile.id is null or profile.role<>'super_admin' or profile.account_status<>'approved' then
      perform viabil_private.fail(403,'Este recurso exige acesso de superadministrador.');
    end if;
    if operation='account-admin' then return jsonb_build_object('user',viabil_private.public_user(profile)); end if;
    select * into target from viabil_private.profiles where id=(payload->>'id')::uuid for update;
    if not found then perform viabil_private.fail(404,'Conta não encontrada.'); end if;
    if target.disabled_at is not null and operation<>'status' then perform viabil_private.fail(403,'O acesso desta conta está bloqueado.'); end if;
    if operation in ('status','review') then
      if target.role<>'user' then perform viabil_private.fail(400,'Selecione uma conta de usuário comum.'); end if;
      op_key:=viabil_private.field(coalesce(payload->'requestKey',to_jsonb(gen_random_uuid()::text)),180,1);
      note:=viabil_private.field(coalesce(payload->'note','"Revisão administrativa"'::jsonb),250,3);
      action:=payload->>'decision';
      if operation='status' then
        if jsonb_typeof(payload->'blocked') is distinct from 'boolean' then perform viabil_private.fail(400,'Informe se a conta deve ser bloqueada.'); end if;
        blocked:=(payload->>'blocked')::boolean;
        action:=case when blocked then 'blocked' else 'restored' end;
      end if;
      select * into previous from viabil_private.account_events where user_id=target.id and operation_key=op_key;
      if found then
        if previous.actor_id<>uid or previous.action is distinct from action or previous.note<>note then
          perform viabil_private.fail(409,'Esta identificação já foi usada para outra operação.');
        end if;
        return jsonb_build_object('user',viabil_private.public_user(target),'duplicate',true);
      end if;
      if operation='status' then
        update viabil_private.profiles set disabled_at=case when blocked then stamp else null end,updated_at=stamp where id=target.id returning * into target;
        delete from auth.sessions where user_id=target.id;
        delete from viabil_private.access_links where user_id=target.id;
        result:=jsonb_build_object('user',viabil_private.public_user(target));
      else
        result:=viabil_private.viabil_api(operation,payload);
      end if;
      if not (result ? 'error') then
        insert into viabil_private.account_events(user_id,actor_id,action,operation_key,note,created_at)
          values(target.id,uid,action,op_key,note,stamp);
      end if;
      return result;
    end if;
    if payload->'note' is null or (jsonb_typeof(payload->'note')='string' and btrim(payload->>'note')='') then
      note:=coalesce((select l.note from viabil_private.ledger l where l.user_id=target.id and l.kind='grant' and l.operation_key=payload->>'requestKey'),'Liberação administrativa');
      payload:=payload||jsonb_build_object('note',note);
    end if;
    if exists(select 1 from viabil_private.ledger l where l.user_id=target.id and l.kind='grant' and l.operation_key=payload->>'requestKey'
      and (l.actor_id<>uid or l.note<>coalesce(payload->>'note',''))) then
      perform viabil_private.fail(409,'Esta identificação já foi usada para outra liberação.');
    end if;
  end if;
  result:=viabil_private.viabil_api(operation,payload);
  if operation='overview' and not (result ? 'error') then
    for entry in select * from jsonb_array_elements(result->'users') loop
      select * into target from viabil_private.profiles where id=(entry->>'id')::uuid;
      items:=items||jsonb_build_array(entry||jsonb_build_object('accountStatus',case when target.disabled_at is not null then 'blocked' else target.account_status end,
        'hasPassword',viabil_private.public_user(target)->'hasPassword','emailVerified',viabil_private.public_user(target)->'emailVerified'));
    end loop;
    result:=jsonb_set(result,'{users}',items);
    select coalesce(jsonb_agg(e),'[]') into items from jsonb_array_elements(result->'pendingUsers') e
      where not exists(select 1 from viabil_private.profiles where id=(e->>'id')::uuid and disabled_at is not null);
    result:=jsonb_set(result,'{pendingUsers}',items);
    result:=jsonb_set(result,'{totals,pendingUsers}',to_jsonb((select count(*) from viabil_private.profiles where account_status='pending' and disabled_at is null)));
  end if;
  return result;
exception when sqlstate 'P0001' then
  get stacked diagnostics details=pg_exception_detail;
  return jsonb_build_object('error',sqlerrm)||details::jsonb;
when invalid_text_representation then return jsonb_build_object('error','Confira os dados enviados.','status',400);
end $$;
revoke all on function public.viabil_api(text,jsonb) from public,anon;
grant execute on function public.viabil_api(text,jsonb) to authenticated;

-- Only the Pages server credential can provision accounts or redeem private links.
-- Auth credentials are changed through the provider Admin API, never by SQL.
create or replace function public.viabil_accounts(operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor viabil_private.profiles; target viabil_private.profiles; identity_user auth.users;
  link viabil_private.access_links; previous viabil_private.account_events;
  stamp bigint:=floor(extract(epoch from clock_timestamp())*1000);
  op_key text; note text; details text; account_email text; account_name text;
begin
  if operation in ('check','consume','complete') then
    select * into link from viabil_private.access_links where hash=payload->>'hash';
    if not found then perform viabil_private.fail(400,'Este link expirou ou já foi utilizado. Solicite um novo.'); end if;
    select * into target from viabil_private.profiles where id=link.user_id for update;
    -- Re-read after locking to serialize use, reissue and blocking.
    select * into link from viabil_private.access_links where hash=payload->>'hash' for update;
    stamp:=floor(extract(epoch from clock_timestamp())*1000);
    if not found or target.disabled_at is not null or target.account_status='rejected'
      or link.expires_at<=stamp or link.completed_at is not null
      or (operation<>'complete' and link.consumed_at is not null) then
      perform viabil_private.fail(400,'Este link expirou ou já foi utilizado. Solicite um novo.');
    end if;
    if operation='check' then return '{"valid":true}'; end if;
    if operation='consume' then
      update viabil_private.access_links set consumed_at=stamp where hash=link.hash;
      update viabil_private.profiles set credentials_defined=false,updated_at=stamp where id=target.id;
      delete from auth.sessions where user_id=target.id;
      return jsonb_build_object('userId',target.id);
    end if;
    if link.consumed_at is null then perform viabil_private.fail(400,'Link ainda não utilizado.'); end if;
    update viabil_private.access_links set completed_at=stamp where hash=link.hash;
    update viabil_private.profiles set credentials_defined=true,updated_at=stamp where id=target.id;
    delete from auth.sessions where user_id=target.id;
    insert into viabil_private.account_events(user_id,actor_id,action,operation_key,note,created_at)
      values(target.id,link.actor_id,'password-defined',link.hash,'Senha definida pelo portador do link privado',stamp);
    return '{"ok":true}';
  end if;
  select * into actor from viabil_private.profiles where id=(payload->>'actorId')::uuid for update;
  if not found or actor.role<>'super_admin' or actor.account_status<>'approved' or actor.disabled_at is not null then
    perform viabil_private.fail(403,'Este recurso exige acesso de superadministrador.');
  end if;
  if not exists(select 1 from auth.sessions where user_id=actor.id and id=(payload->>'sessionId')::uuid) then
    perform viabil_private.fail(401,'Sua sessão terminou. Entre novamente.');
  end if;
  op_key:=viabil_private.field(payload->'requestKey',180,1);
  if op_key !~ '^[a-zA-Z0-9:_-]+$' then perform viabil_private.fail(400,'Identificação da operação inválida.'); end if;
  if operation in ('lookup','provision') then
    account_email:=lower(viabil_private.field(payload->'email',254,3));
    account_name:=viabil_private.field(payload->'name',100,2);
    if account_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then perform viabil_private.fail(400,'Informe um e-mail válido.'); end if;
    select * into identity_user from auth.users where lower(auth.users.email)=account_email;
    if not found then
      if operation='lookup' then return '{"userId":null}'; end if;
      perform viabil_private.fail(409,'A conta ainda não foi criada no provedor. Tente novamente.');
    end if;
    if identity_user.raw_app_meta_data->>'viabil_request_key' is distinct from op_key
      or identity_user.raw_app_meta_data->>'viabil_actor' is distinct from actor.id::text
      or identity_user.raw_user_meta_data->>'full_name' is distinct from account_name then
      perform viabil_private.fail(409,'Já existe uma conta com este e-mail. Atualize a lista.');
    end if;
    if operation='lookup' then return jsonb_build_object('userId',identity_user.id); end if;
    insert into viabil_private.profiles(id,email,name,credentials_defined,email_verified,creation_key,created_at,updated_at,last_seen_at)
      values(identity_user.id,account_email,account_name,false,false,op_key,stamp,stamp,stamp) on conflict(id) do nothing;
    select * into target from viabil_private.profiles where id=identity_user.id for update;
    if exists(select 1 from viabil_private.account_events where user_id=target.id and action='created') then
      return jsonb_build_object('user',viabil_private.public_user(target),'duplicate',true);
    end if;
    note:='Cadastro administrado';
  elsif operation='issue' then
    select * into target from viabil_private.profiles where id=(payload->>'id')::uuid for update;
    if not found then perform viabil_private.fail(404,'Conta não encontrada.'); end if;
    note:=viabil_private.field(payload->'note',250,3);
  else perform viabil_private.fail(404,'Recurso não encontrado.');
  end if;
  if target.role<>'user' or target.disabled_at is not null or target.account_status='rejected' then
    perform viabil_private.fail(403,'Selecione uma conta comum com acesso permitido.');
  end if;
  if exists(select 1 from viabil_private.access_links where user_id=target.id and consumed_at is not null and completed_at is null and expires_at>stamp) then
    perform viabil_private.fail(409,'Uma definição de senha está em andamento. Se houve falha, aguarde a expiração do link para reemitir.');
  end if;
  select * into previous from viabil_private.account_events where user_id=target.id and operation_key=op_key;
  if found then
    if previous.actor_id<>actor.id or previous.note<>note or previous.action<>(case when operation='provision' then 'created' else 'access-link' end) then
      perform viabil_private.fail(409,'Esta identificação já foi usada para outra operação.');
    end if;
    return '{"duplicate":true}';
  end if;
  delete from viabil_private.access_links where user_id=target.id;
  insert into viabil_private.access_links(hash,user_id,actor_id,expires_at) values(payload->>'hash',target.id,actor.id,stamp+1800000);
  insert into viabil_private.account_events(user_id,actor_id,action,operation_key,note,created_at)
    values(target.id,actor.id,case when operation='provision' then 'created' else 'access-link' end,op_key,note,stamp);
  return jsonb_build_object('user',viabil_private.public_user(target),'expiresAt',stamp+1800000);
exception when sqlstate 'P0001' then
  get stacked diagnostics details=pg_exception_detail;
  return jsonb_build_object('error',sqlerrm)||details::jsonb;
when unique_violation then return jsonb_build_object('error','Já existe uma conta ou operação com estes dados. Atualize a lista.','status',409);
when invalid_text_representation or check_violation then return jsonb_build_object('error','Confira os dados enviados.','status',400);
end $$;
revoke all on function public.viabil_accounts(text,jsonb) from public,anon,authenticated;
grant execute on function public.viabil_accounts(text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
