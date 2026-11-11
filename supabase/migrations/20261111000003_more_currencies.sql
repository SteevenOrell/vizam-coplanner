-- More currencies (ISO 4217 minor units). Same list as src/domain/money/currency.ts.
insert into public.currencies (code, minor_unit, name) values
  ('USD', 2, 'US dollar'),
  ('EUR', 2, 'Euro'),
  ('GBP', 2, 'Pound sterling'),
  ('CHF', 2, 'Swiss franc'),
  ('XAF', 0, 'Central African CFA franc'),
  ('NGN', 2, 'Nigerian naira'),
  ('GHS', 2, 'Ghanaian cedi'),
  ('MAD', 2, 'Moroccan dirham')
on conflict (code) do nothing;
