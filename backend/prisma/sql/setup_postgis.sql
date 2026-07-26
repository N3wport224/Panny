-- ---------------------------------------------------------------------------
-- PostGIS setup for Panny
-- Run once after `prisma migrate dev`:
--   psql $DATABASE_URL -f prisma/sql/setup_postgis.sql
-- ---------------------------------------------------------------------------

-- 1. Enable the extension (no-op if the migration already did it).
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Backfill the geography column from lat/lng for any pre-existing rows.
--    ST_MakePoint takes (longitude, latitude) — x before y. 4326 = WGS 84,
--    the GPS coordinate system the mobile app reports.
UPDATE stores
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL;

-- 3. Trigger: keep `location` in sync whenever lat/lng change, so app code
--    only ever writes the two Float columns Prisma understands.
CREATE OR REPLACE FUNCTION sync_store_location()
RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(
    ST_MakePoint(NEW.longitude, NEW.latitude), 4326
  )::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_store_location ON stores;
CREATE TRIGGER trg_sync_store_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON stores
FOR EACH ROW
EXECUTE FUNCTION sync_store_location();
