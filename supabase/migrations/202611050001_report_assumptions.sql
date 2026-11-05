-- Validate the report's optional assumptions on future saves. Existing rows are not rewritten.
-- Requires 202610300001_pages.sql; safe to apply again.
begin;
create or replace function viabil_private.validate_report_assumptions()
returns trigger language plpgsql set search_path='' as $$
declare
  scenario jsonb:=new.payload->'scenario'; finance jsonb; discount jsonb;
  key text; value numeric; reference_date text;
begin
  perform viabil_private.number(scenario->'profit',0,100);
  perform viabil_private.number(scenario->'unitArea',0,1000000);
  foreach key in array array['price','cost'] loop
    perform viabil_private.number(scenario->key,0,1000000000);
  end loop;
  if scenario ? 'regimeVariant' and coalesce(scenario->>'regimeVariant','') not in ('general','note-b') then
    perform viabil_private.fail(400,'Regime de cenário inválido.');
  end if;
  if scenario ? 'balconyProjectionMeters' then
    perform viabil_private.number(scenario->'balconyProjectionMeters',0,0.5);
  end if;
  if scenario ? 'finance' then
    finance:=scenario->'finance';
    if jsonb_typeof(finance) is distinct from 'object' then
      perform viabil_private.fail(400,'Premissas financeiras inválidas.');
    end if;
    foreach key in array array['elevatorCost','generatorCost','projectsFloor','registrationCost','outorgaCost'] loop
      if finance ? key then perform viabil_private.number(finance->key,0,1000000000); end if;
    end loop;
    foreach key in array array['constructionMonths','salesStartMonth','salesMonths'] loop
      if finance ? key then
        value:=viabil_private.number(finance->key,case when key='salesStartMonth' then 0 else 1 end,120);
        if value<>floor(value) then perform viabil_private.fail(400,'Cronograma financeiro inválido.'); end if;
      end if;
    end loop;
    if finance ? 'discount' then
      discount:=finance->'discount';
      if jsonb_typeof(discount) is distinct from 'object' then
        perform viabil_private.fail(400,'Referência de TMA inválida.');
      end if;
      perform viabil_private.number(discount->'annualRate',0,1);
      perform viabil_private.field(discount->'source',250,1);
      reference_date:=viabil_private.field(discount->'date',10,10);
      if reference_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        perform viabil_private.fail(400,'Data da referência de TMA inválida.');
      end if;
      begin
        if (reference_date::date)::text<>reference_date then
          perform viabil_private.fail(400,'Data da referência de TMA inválida.');
        end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        perform viabil_private.fail(400,'Data da referência de TMA inválida.');
      end;
    end if;
  end if;
  return new;
end $$;
revoke all on function viabil_private.validate_report_assumptions() from public,anon,authenticated;
drop trigger if exists validate_report_assumptions on viabil_private.studies;
create trigger validate_report_assumptions before insert or update of payload
  on viabil_private.studies for each row execute function viabil_private.validate_report_assumptions();
notify pgrst, 'reload schema';
commit;
