-- sól · birth chart geocode
-- Cache the geocoded birth place (Open-Meteo) alongside the raw text so the
-- natal chart can convert local birth time → UTC and place the Ascendant/houses
-- accurately, and so the wheel renders offline after the one-time lookup.
-- All nullable: a chart without a resolved place still degrades to planets-in-signs.

alter table public.birth_charts
  add column birth_lat double precision,
  add column birth_lng double precision,
  add column birth_tz text,
  add column birth_place_label text;
