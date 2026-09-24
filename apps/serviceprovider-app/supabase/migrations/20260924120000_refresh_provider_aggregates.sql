-- HLP-27: keep service_provider.rating and jobs_completed in sync with
-- completed jobs and service_provider_ratings.
--
-- rating: mean of ratings in [1, 5], rounded to 2 decimal places, or NULL.
-- jobs_completed: count of service rows with status = 'completed'.
--
-- Same rules as supabase/functions/_shared/providerAggregates.mjs.
-- Signup may still insert rating NULL and jobs_completed 0. This overwrites
-- those columns from source rows and does not change payment columns.

-- p_provider_id is text so this works whether service_provider_id is uuid or text.
CREATE OR REPLACE FUNCTION public.refresh_service_provider_aggregates(p_provider_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs integer;
  v_rating numeric;
BEGIN
  IF p_provider_id IS NULL OR btrim(p_provider_id) = '' THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
    INTO v_jobs
  FROM public.service
  WHERE service_provider_id::text = p_provider_id
    AND status = 'completed';

  SELECT ROUND(AVG(rating)::numeric, 2)
    INTO v_rating
  FROM public.service_provider_ratings
  WHERE service_provider_id::text = p_provider_id
    AND rating IS NOT NULL
    AND rating >= 1
    AND rating <= 5;

  UPDATE public.service_provider
  SET
    jobs_completed = v_jobs,
    rating = v_rating
  WHERE service_provider_id::text = p_provider_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_service_provider_aggregates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_service_provider_aggregates(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_refresh_provider_aggregates_from_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.refresh_service_provider_aggregates(NEW.service_provider_id::text);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      PERFORM public.refresh_service_provider_aggregates(OLD.service_provider_id::text);
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.service_provider_id IS DISTINCT FROM NEW.service_provider_id THEN
    IF OLD.status = 'completed' THEN
      PERFORM public.refresh_service_provider_aggregates(OLD.service_provider_id::text);
    END IF;
  END IF;

  IF NEW.status = 'completed' OR OLD.status = 'completed' THEN
    PERFORM public.refresh_service_provider_aggregates(NEW.service_provider_id::text);
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'provider aggregate refresh from service failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_provider_aggregates_from_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_service_provider_aggregates(OLD.service_provider_id::text);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.rating IS NOT DISTINCT FROM NEW.rating
     AND OLD.service_provider_id IS NOT DISTINCT FROM NEW.service_provider_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.service_provider_id IS DISTINCT FROM NEW.service_provider_id THEN
    PERFORM public.refresh_service_provider_aggregates(OLD.service_provider_id::text);
  END IF;

  PERFORM public.refresh_service_provider_aggregates(NEW.service_provider_id::text);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'provider aggregate refresh from rating failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_refresh_provider_aggregates ON public.service;
CREATE TRIGGER service_refresh_provider_aggregates
AFTER INSERT OR DELETE OR UPDATE OF status, service_provider_id
ON public.service
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_provider_aggregates_from_service();

DROP TRIGGER IF EXISTS service_provider_ratings_refresh_provider_aggregates ON public.service_provider_ratings;
CREATE TRIGGER service_provider_ratings_refresh_provider_aggregates
AFTER INSERT OR DELETE OR UPDATE OF rating, service_provider_id
ON public.service_provider_ratings
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_provider_aggregates_from_rating();

DO $$
DECLARE
  provider_row record;
BEGIN
  FOR provider_row IN
    SELECT service_provider_id FROM public.service_provider
  LOOP
    BEGIN
      PERFORM public.refresh_service_provider_aggregates(provider_row.service_provider_id::text);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'provider aggregate backfill failed for %: %', provider_row.service_provider_id, SQLERRM;
    END;
  END LOOP;
END $$;
