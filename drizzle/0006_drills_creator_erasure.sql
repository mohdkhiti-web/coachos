-- Erasing a user's account must not be blocked by the drills ownership guard.
--
-- drills_immutable_ownership (0003) refuses ANY change of drills.created_by. But drills.created_by is
-- `ON DELETE SET NULL`, and Postgres runs that foreign-key action as an ordinary UPDATE that fires this trigger,
-- so deleting a user who authored a drill in a shared workspace (a club, a school) failed with
-- "drill ownership (organization, sport, creator) is immutable". Personal workspaces never hit it (they are deleted
-- as a whole), which is why it went unnoticed.
--
-- The fix keeps the guard exactly as strict for everyone else: the creator may be CLEARED only when the user
-- really no longer exists — which is what the foreign-key action does, and something no application statement
-- can fake while the account is there. Moving a drill to another workspace, sport or creator is still refused.
CREATE OR REPLACE FUNCTION drills_immutable_ownership() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NOT (NEW.created_by IS NULL AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = OLD.created_by))
  THEN
    RAISE EXCEPTION 'drill ownership (organization, sport, creator) is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sport_id IS DISTINCT FROM OLD.sport_id
  THEN
    RAISE EXCEPTION 'drill ownership (organization, sport, creator) is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
