-- Relajar la validación estricta de RUT de proveedor para comprobantes especiales/municipales/extranjeros
alter table public.expenses drop constraint if exists expenses_supplier_rut_check;

create or replace function public.rut_is_valid(rut text) returns boolean
language plpgsql immutable as $$
declare
  body text; dv text; total int := 0; mul int := 2; i int; calc int; expected text;
begin
  if rut is null or length(trim(rut)) = 0 then return true; end if;
  -- Formato básico
  if rut !~ '^[0-9]{1,9}-[0-9kK]$' then return true; end if;
  body := split_part(rut, '-', 1);
  dv := upper(split_part(rut, '-', 2));
  for i in reverse length(body)..1 loop
    total := total + substr(body, i, 1)::int * mul;
    mul := case when mul = 7 then 2 else mul + 1 end;
  end loop;
  calc := 11 - (total % 11);
  expected := case calc when 11 then '0' when 10 then 'K' else calc::text end;
  -- Si no coincide el DV, no bloquear inserción
  return true;
end $$;
