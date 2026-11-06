-- Validate future normative references and unapproved proposals, including direct RPC calls.
-- Requires 202610300001_pages.sql. Existing studies are preserved. Safe to apply again.
begin;
create or replace function viabil_private.validate_normative_context()
returns trigger language plpgsql set search_path='' as $$
declare
  scenario jsonb:=new.payload->'scenario'; sources jsonb; source jsonb;
  audit jsonb:=new.payload#>'{lot,urbanContext,overrideAudit}'; previous_audit jsonb; revisions jsonb; proposal jsonb;
  identifier text; field_name text; reference_date text; revision_index integer:=0; revision_number numeric;
begin
  if tg_op='UPDATE' and old.identity=new.identity then
    previous_audit:=nullif(old.payload#>'{lot,urbanContext,overrideAudit}','null'::jsonb);
    if previous_audit is not null and previous_audit is distinct from audit then
      if jsonb_typeof(audit->'revisions') is distinct from 'array' then
        perform viabil_private.fail(409,'A exceção técnica mudou. Reabra o estudo antes de editar.');
      end if;
      if (audit->'revisions')-(jsonb_array_length(audit->'revisions')-1) is distinct from previous_audit->'revisions'
        or audit->'original' is distinct from previous_audit->'original' then
        perform viabil_private.fail(409,'A exceção técnica mudou. Reabra o estudo antes de editar.');
      end if;
    end if;
  end if;
  if nullif(scenario->'analysisDate','null'::jsonb) is not null then
    reference_date:=viabil_private.field(scenario->'analysisDate',10,10);
    if reference_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      perform viabil_private.fail(400,'Data normativa inválida.');
    end if;
    begin
      if (reference_date::date)::text<>reference_date then
        perform viabil_private.fail(400,'Data normativa inválida.');
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      perform viabil_private.fail(400,'Data normativa inválida.');
    end;
  end if;
  if scenario ? 'sourceVersions' then
    sources:=scenario->'sourceVersions';
    if jsonb_typeof(sources) is distinct from 'object' then
      perform viabil_private.fail(400,'Versões de fontes inválidas.');
    end if;
    if (select count(*) from jsonb_object_keys(sources))>32 then
      perform viabil_private.fail(400,'Versões de fontes inválidas.');
    end if;
    for identifier,source in select * from jsonb_each(sources) loop
      if identifier !~ '^[a-zA-Z0-9_.-]{1,80}$' or jsonb_typeof(source) is distinct from 'object' then
        perform viabil_private.fail(400,'Versões de fontes inválidas.');
      end if;
      foreach field_name in array array['version','hash'] loop
        if nullif(source->field_name,'null'::jsonb) is not null then
          perform viabil_private.field(source->field_name,200,0);
        end if;
      end loop;
    end loop;
  end if;
  if nullif(audit,'null'::jsonb) is not null then
    if audit->>'schema' is distinct from 'VIABILEASY_OVERRIDE_V1'
      or audit->>'status' is distinct from 'pending_review'
      or audit->'legalValidation' is distinct from 'false'::jsonb
      or jsonb_typeof(audit->'revisions') is distinct from 'array' then
      perform viabil_private.fail(400,'Histórico da exceção técnica inválido.');
    end if;
    revisions:=audit->'revisions';
    if jsonb_array_length(revisions) not between 1 and 50
      or viabil_private.number(audit->'version',1,50)<>jsonb_array_length(revisions) then
      perform viabil_private.fail(400,'Versão da exceção técnica inválida.');
    end if;
    for proposal in select * from jsonb_array_elements(revisions) loop
      revision_index:=revision_index+1;
      revision_number:=viabil_private.number(proposal->'version',1,50);
      if revision_number<>revision_index or coalesce(proposal->>'status','') not in ('pending_review','legacy_unverified') then
        perform viabil_private.fail(400,'Versão da exceção técnica inválida.');
      end if;
      foreach field_name in array array['front','side','back'] loop
        if proposal->>'status'='legacy_unverified' and nullif(proposal#>array['values',field_name],'null'::jsonb) is null then
          continue;
        end if;
        perform viabil_private.number(proposal#>array['values',field_name],0,1000);
      end loop;
    end loop;
    proposal:=revisions->-1;
    if proposal->>'status' is distinct from 'pending_review' or auth.uid() is null
      or new.user_id<>auth.uid() or proposal#>>'{responsible,accountId}' is distinct from auth.uid()::text then
      perform viabil_private.fail(400,'Responsável da exceção deve corresponder à sessão.');
    end if;
    perform viabil_private.field(proposal->'justification',2000,1);
    if new.payload#>>'{lot,urbanContext,mode}'='manual' then
      foreach field_name in array array['front','side','back'] loop
        if proposal#>array['values',field_name] is distinct from new.payload#>array['lot','urbanContext',field_name] then
          perform viabil_private.fail(400,'Valores da exceção diferem da versão registrada.');
        end if;
      end loop;
    end if;
    begin
      perform viabil_private.field(proposal->'recordedAt',40,10)::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      perform viabil_private.fail(400,'Data da exceção técnica inválida.');
    end;
  end if;
  return new;
end $$;
revoke all on function viabil_private.validate_normative_context() from public,anon,authenticated;
drop trigger if exists validate_normative_context on viabil_private.studies;
create trigger validate_normative_context before insert or update of payload
  on viabil_private.studies for each row execute function viabil_private.validate_normative_context();
notify pgrst, 'reload schema';
commit;
