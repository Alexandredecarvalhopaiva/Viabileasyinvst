-- CPTECH-7. Apply after the existing Pages migrations, using the database owner.
begin;

alter table viabil_private.studies add column if not exists metadata jsonb not null
  default '{"schemaVersion":1,"stage":"triage","tags":[],"note":"","revision":0,"updatedAt":null}'::jsonb;

-- Legacy RPC saves replace payload. The separate column remains authoritative.
create or replace function viabil_private.preserve_study_metadata()
returns trigger language plpgsql set search_path='' as $$
begin
  new.payload:=new.payload||jsonb_build_object('metadata',new.metadata);
  return new;
end $$;
drop trigger if exists preserve_study_metadata on viabil_private.studies;
create trigger preserve_study_metadata before insert or update on viabil_private.studies
  for each row execute function viabil_private.preserve_study_metadata();
-- The trigger adds the envelope without revalidating historic calculation inputs.
update viabil_private.studies set metadata=metadata
  where payload->'metadata' is distinct from metadata;

create or replace function public.viabil_study_metadata(operation text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); session_data jsonb; profile viabil_private.profiles;
  study viabil_private.studies; identifier text; expected numeric; result jsonb;
  tags jsonb:='[]'; tag jsonb; label text; key text; seen text[]:='{}'; note text;
  error_detail text;
begin
  -- Reuse identity confirmation, rate accounting and approval from the existing RPC.
  session_data:=public.viabil_api('session');
  if session_data ? 'error' then return session_data; end if;
  -- Retain rate accounting when a metadata mutation is rejected.
  begin
  select * into profile from viabil_private.profiles where id=uid for update;
  if not found or profile.account_status<>'approved' then
    perform viabil_private.fail(403,'Seu cadastro precisa estar aprovado.');
  end if;
  if operation not in ('get-metadata','save-metadata') or operation is null then
    perform viabil_private.fail(404,'Recurso não encontrado.');
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    perform viabil_private.fail(400,'Metadados inválidos.','INVALID_METADATA');
  end if;
  identifier:=payload->>'id';
  if identifier is null or identifier !~ '^[a-zA-Z0-9_-]{1,80}$' then
    perform viabil_private.fail(400,'Identificação do estudo inválida.');
  end if;
  select * into study from viabil_private.studies where user_id=uid and id=identifier for update;
  if not found then perform viabil_private.fail(404,'Estudo não encontrado na sua conta.'); end if;
  if operation='get-metadata' then return jsonb_build_object('metadata',study.metadata); end if;

  if jsonb_typeof(payload->'expectedRevision') is distinct from 'number'
    or coalesce(payload->>'stage','') not in ('triage','in_study','waiting_information','archived')
    or jsonb_typeof(payload->'stage') is distinct from 'string'
    or jsonb_typeof(payload->'tags') is distinct from 'array'
    or jsonb_typeof(coalesce(payload->'note','""'::jsonb)) is distinct from 'string' then
    perform viabil_private.fail(400,'Confira a etapa, as etiquetas e a nota.','INVALID_METADATA');
  end if;
  expected:=(payload->>'expectedRevision')::numeric;
  if expected<0 or expected>=9007199254740991 or trunc(expected)<>expected
    or jsonb_array_length(payload->'tags')>10 then
    perform viabil_private.fail(400,'Revisão ou quantidade de etiquetas inválida.','INVALID_METADATA');
  end if;
  note:=regexp_replace(coalesce(payload->>'note',''),'^[\s]+|[\s]+$','','g');
  if length(note)>1000 then perform viabil_private.fail(400,'Use uma nota de até 1.000 caracteres.','INVALID_METADATA'); end if;
  for tag in select value from jsonb_array_elements(payload->'tags') loop
    if jsonb_typeof(tag) is distinct from 'string' then
      perform viabil_private.fail(400,'Etiqueta inválida.','INVALID_METADATA');
    end if;
    label:=regexp_replace(tag#>>'{}','^[\s]+|[\s]+$','','g');
    if length(label)<1 or length(label)>32 then
      perform viabil_private.fail(400,'Cada etiqueta precisa ter entre 1 e 32 caracteres.','INVALID_METADATA');
    end if;
    key:=lower(regexp_replace(normalize(label,NFD),U&'[\0300-\036f]','','g'));
    if not key=any(seen) then tags:=tags||jsonb_build_array(label); seen:=array_append(seen,key); end if;
  end loop;
  if expected<>(study.metadata->>'revision')::bigint then
    perform viabil_private.fail(409,'Este estudo foi organizado em outra sessão. Carregue a revisão atual.','METADATA_CONFLICT');
  end if;
  result:=jsonb_build_object('schemaVersion',1,'stage',payload->>'stage','tags',tags,'note',note,
    'revision',expected::bigint+1,'updatedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
  update viabil_private.studies set metadata=result where user_id=uid and id=identifier;
  return jsonb_build_object('metadata',result);
exception
  when sqlstate 'P0001' then
    get stacked diagnostics error_detail=pg_exception_detail;
    return jsonb_build_object('error',sqlerrm)||error_detail::jsonb;
  end;
end $$;

revoke all on function viabil_private.preserve_study_metadata() from public,anon,authenticated;
revoke all on function public.viabil_study_metadata(text,jsonb) from public,anon,authenticated;
grant execute on function public.viabil_study_metadata(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
