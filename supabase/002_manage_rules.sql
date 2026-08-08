-- supabase/002_manage_rules.sql — single CRUD RPC for rules + camelCase formatter.

-- Formats one rules row as the camelCase JSON the API/dashboard expect.
CREATE OR REPLACE FUNCTION public._rule_json(r public.rules)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id',        r.id,
    'subjectId', r.subject_id,
    'label',     r.label,
    'text',      r.text,
    'active',    r.active,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  );
$$;

-- Action-discriminated CRUD. SECURITY INVOKER (default) so RLS applies with the caller JWT.
CREATE OR REPLACE FUNCTION public.manage_rules(
  p_action     text,
  p_rule_id    uuid    DEFAULT NULL,
  p_subject_id uuid    DEFAULT NULL,
  p_scope      text    DEFAULT NULL,   -- 'global' | 'subject' | 'all' (list only)
  p_label      text    DEFAULT NULL,   -- short title (required on add)
  p_text       text    DEFAULT NULL,   -- description / instruction (optional)
  p_active     boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.rules;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_action = 'list' THEN
    IF p_subject_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'subjectId', p_subject_id,
        'rules', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id = p_subject_id
        ), '[]'::jsonb)
      );
    ELSIF p_scope = 'global' THEN
      RETURN jsonb_build_object(
        'global', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id IS NULL
        ), '[]'::jsonb)
      );
    ELSE
      -- everything, grouped
      RETURN jsonb_build_object(
        'global', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id IS NULL
        ), '[]'::jsonb),
        'subjects', COALESCE((
          SELECT jsonb_object_agg(sub.subject_id::text, sub.rules)
          FROM (
            SELECT r.subject_id,
                   jsonb_agg(public._rule_json(r) ORDER BY r.created_at) AS rules
            FROM public.rules r
            WHERE r.user_id = v_uid AND r.subject_id IS NOT NULL
            GROUP BY r.subject_id
          ) sub
        ), '{}'::jsonb)
      );
    END IF;

  ELSIF p_action = 'add' THEN
    IF p_label IS NULL OR length(btrim(p_label)) = 0 THEN
      RAISE EXCEPTION 'p_label is required for add';
    END IF;
    IF p_subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subjects s WHERE s.id = p_subject_id AND s.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'subject not found or not owned by user';
    END IF;
    INSERT INTO public.rules (user_id, subject_id, label, text, active)
    VALUES (v_uid, p_subject_id, btrim(p_label), COALESCE(p_text, ''), COALESCE(p_active, true))
    RETURNING * INTO v_row;
    RETURN public._rule_json(v_row);

  ELSIF p_action = 'update' THEN
    IF p_rule_id IS NULL THEN
      RAISE EXCEPTION 'p_rule_id is required for update';
    END IF;
    IF p_label IS NOT NULL AND length(btrim(p_label)) = 0 THEN
      RAISE EXCEPTION 'p_label cannot be empty';
    END IF;
    UPDATE public.rules
      SET label  = COALESCE(btrim(p_label), label),
          text   = COALESCE(p_text, text),
          active = COALESCE(p_active, active)
      WHERE id = p_rule_id AND user_id = v_uid
      RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'rule not found';
    END IF;
    RETURN public._rule_json(v_row);

  ELSIF p_action = 'delete' THEN
    IF p_rule_id IS NULL THEN
      RAISE EXCEPTION 'p_rule_id is required for delete';
    END IF;
    DELETE FROM public.rules
      WHERE id = p_rule_id AND user_id = v_uid
      RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'rule not found';
    END IF;
    RETURN jsonb_build_object('deleted', true, 'id', p_rule_id);

  ELSE
    RAISE EXCEPTION 'unknown action: %', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_rules(text, uuid, uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public._rule_json(public.rules) TO authenticated;
