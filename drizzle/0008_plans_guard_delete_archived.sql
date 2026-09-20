-- Fix to plans_guard (0005): an archived session could not be soft-deleted (or restored from the trash).
--
-- The archive freeze compared every column except a short ignore list, and `deleted_at` was not on it, so
-- changing only `deleted_at` on an archived row counted as "editing an archived session". Deleting and restoring are
-- lifecycle changes, not edits of the content, so `deleted_at` joins the ignore list. Everything else is unchanged:
-- an archived session's content is still frozen, a deleted session is still frozen until it is restored, and
-- ownership is still immutable.
CREATE OR REPLACE FUNCTION plans_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ignored constant text[] := ARRAY['version', 'updated_at', 'forked_from_id', 'created_by', 'deleted_at'];
BEGIN
  IF NEW.timezone IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.timezone IS DISTINCT FROM OLD.timezone)
     AND NOT EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = NEW.timezone)
  THEN
    RAISE EXCEPTION 'unknown time zone: %', NEW.timezone USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
    THEN
      RAISE EXCEPTION 'session ownership (creator) is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
       OR NEW.type IS DISTINCT FROM OLD.type
    THEN
      RAISE EXCEPTION 'session ownership (workspace, sport, type) is immutable' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_ignored) IS DISTINCT FROM (to_jsonb(OLD) - v_ignored) THEN
      IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'a deleted session cannot be edited: restore it first' USING ERRCODE = '42501';
      END IF;
      IF OLD.status = 'archived' AND NEW.status = 'archived' THEN
        RAISE EXCEPTION 'an archived session cannot be edited: change its status first' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
