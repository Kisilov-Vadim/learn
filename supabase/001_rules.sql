-- supabase/001_rules.sql — user custom rules table.
CREATE TABLE IF NOT EXISTS public.rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,  -- NULL = global
  text       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rules_user_subject_active_idx
  ON public.rules (user_id, subject_id, active);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rules_select ON public.rules;
DROP POLICY IF EXISTS rules_insert ON public.rules;
DROP POLICY IF EXISTS rules_update ON public.rules;
DROP POLICY IF EXISTS rules_delete ON public.rules;

CREATE POLICY rules_select ON public.rules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY rules_insert ON public.rules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY rules_update ON public.rules FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY rules_delete ON public.rules FOR DELETE USING (user_id = auth.uid());

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rules_set_updated_at ON public.rules;
CREATE TRIGGER rules_set_updated_at
  BEFORE UPDATE ON public.rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
