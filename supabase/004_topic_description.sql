-- supabase/004_topic_description.sql
-- Adds a free-text (markdown) description to topics, shown in the dashboard topic panel.
-- add_topic gains p_description (signature change: old overload dropped first so PostgREST
-- does not see two candidates); update_topic accepts patch.description; get_topic returns it;
-- get_schema documents it (and fixes the stale patch/create field lists and status values).

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS description text;

DROP FUNCTION IF EXISTS public.add_topic(uuid, text, text, uuid[], jsonb, integer);

CREATE OR REPLACE FUNCTION public.add_topic(p_subject_id uuid, p_name text, p_level text, p_prerequisites uuid[], p_resources jsonb, p_desired_score integer DEFAULT 5, p_description text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
AS $function$ DECLARE v_topic topics%ROWTYPE; v_max_order INTEGER; v_desired INTEGER; BEGIN v_desired := COALESCE(p_desired_score, 5); IF v_desired < 1 OR v_desired > 5 THEN RAISE EXCEPTION 'desiredScore must be between 1 and 5, got %', v_desired; END IF; SELECT COALESCE(MAX(order_index) + 1, 0) INTO v_max_order FROM topics WHERE subject_id = p_subject_id AND user_id = auth.uid(); INSERT INTO topics (user_id, subject_id, name, level, prerequisites, resources, order_index, desired_score, description) VALUES (auth.uid(), p_subject_id, p_name, p_level, COALESCE(p_prerequisites, '{}'), COALESCE(p_resources, '[]'::jsonb), v_max_order, v_desired, NULLIF(btrim(p_description), '')) RETURNING * INTO v_topic; RETURN json_build_object('id', v_topic.id, 'subjectId', v_topic.subject_id, 'name', v_topic.name, 'level', v_topic.level, 'score', v_topic.score, 'status', v_topic.status, 'desiredScore', v_topic.desired_score, 'orderIndex', v_topic.order_index, 'description', v_topic.description); END; $function$;

-- patch.description: a string sets it, "" clears it, absent leaves it unchanged.
CREATE OR REPLACE FUNCTION public.update_topic(p_topic_id uuid, p_patch jsonb)
 RETURNS json
 LANGUAGE plpgsql
AS $function$ DECLARE v_topic topics%ROWTYPE; v_current_score integer; v_current_desired integer; v_final_score integer; v_final_desired integer; BEGIN SELECT score, desired_score INTO v_current_score, v_current_desired FROM topics WHERE id = p_topic_id AND user_id = auth.uid(); IF NOT FOUND THEN RAISE EXCEPTION 'Topic not found: %', p_topic_id; END IF; v_final_score := COALESCE((p_patch->>'score')::integer, v_current_score); v_final_desired := COALESCE((p_patch->>'desiredScore')::integer, v_current_desired); IF v_final_score > v_final_desired THEN RAISE EXCEPTION 'score (%) cannot exceed desiredScore (%)', v_final_score, v_final_desired; END IF; UPDATE topics SET score = COALESCE((p_patch->>'score')::INTEGER, score), status = COALESCE(p_patch->>'status', status), next_review = COALESCE((p_patch->>'nextReview')::DATE, next_review), last_reviewed = COALESCE((p_patch->>'lastReviewed')::DATE, last_reviewed), best_method = COALESCE(p_patch->>'bestMethod', best_method), review_count = COALESCE((p_patch->>'reviewCount')::INTEGER, review_count), desired_score = COALESCE((p_patch->>'desiredScore')::INTEGER, desired_score), description = CASE WHEN p_patch ? 'description' THEN NULLIF(btrim(p_patch->>'description'), '') ELSE description END WHERE id = p_topic_id AND user_id = auth.uid() RETURNING * INTO v_topic; RETURN json_build_object('id', v_topic.id, 'score', v_topic.score, 'status', v_topic.status, 'nextReview', v_topic.next_review, 'lastReviewed', v_topic.last_reviewed, 'bestMethod', v_topic.best_method, 'reviewCount', v_topic.review_count, 'desiredScore', v_topic.desired_score, 'description', v_topic.description); END; $function$;

CREATE OR REPLACE FUNCTION public.get_topic(p_topic_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT json_build_object('id', t.id, 'subjectId', t.subject_id, 'name', t.name, 'description', t.description, 'level', t.level, 'score', t.score, 'status', t.status, 'desiredScore', t.desired_score, 'prerequisites', t.prerequisites, 'resources', t.resources, 'bestMethod', t.best_method, 'reviewCount', t.review_count, 'nextReview', t.next_review, 'lastReviewed', t.last_reviewed, 'touches', COALESCE((SELECT json_agg(json_build_object('id', tc.id, 'method', tc.method, 'scoreBefore', tc.score_before, 'scoreAfter', tc.score_after, 'effectiveness', tc.effectiveness, 'agentComment', tc.agent_comment, 'createdAt', tc.created_at) ORDER BY tc.created_at DESC) FROM (SELECT * FROM touches WHERE topic_id = t.id AND user_id = auth.uid() ORDER BY created_at DESC LIMIT 5) tc), '[]'::json)) FROM topics t WHERE t.id = p_topic_id AND t.user_id = auth.uid(); $function$;

CREATE OR REPLACE FUNCTION public.get_schema()
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$;
SELECT json_build_object(
  'entities', json_build_object(
    'subject', json_build_object(
      'createFields', '["name","goal","currentLevel","targetLevel"]'::json,
      'patchFields', '["currentLevel"]'::json,
      'fields', json_build_object(
        'id',           json_build_object('type','uuid','readonly',true),
        'name',         json_build_object('type','string','required',true),
        'goal',         json_build_object('type','string','required',true),
        'currentLevel', json_build_object('type','enum','required',true,'values','["beginner","junior","middle","senior","principal"]'::json),
        'targetLevel',  json_build_object('type','enum','required',true,'values','["beginner","junior","middle","senior","principal"]'::json),
        'streak',       json_build_object('type','number','readonly',true),
        'lastUpdated',  json_build_object('type','date','readonly',true)
      )
    ),
    'topic', json_build_object(
      'queryFilters', '["status","level","scoreMin","scoreMax","dueBy"]'::json,
      'sortFields',   '["score","nextReview","lastReviewed","name"]'::json,
      'patchFields',  '["score","status","nextReview","lastReviewed","bestMethod","reviewCount","desiredScore","description"]'::json,
      'createFields', '["name","level","prerequisites","resources","desiredScore","description"]'::json,
      'fields', json_build_object(
        'id',           json_build_object('type','uuid','readonly',true),
        'name',         json_build_object('type','string','required',true),
        'description',  json_build_object('type','string','nullable',true,'format','markdown','note','What the topic is about, roadmap.sh style: 2-6 sentences, markdown allowed. Shown in the dashboard topic panel.'),
        'level',        json_build_object('type','enum','required',true,'values','["beginner","junior","middle","senior","principal"]'::json),
        'score',        json_build_object('type','number','min',0,'max',5),
        'status',       json_build_object('type','enum','values','["not-started","learning","completed"]'::json),
        'nextReview',   json_build_object('type','date','nullable',true),
        'lastReviewed', json_build_object('type','date','nullable',true),
        'bestMethod',   json_build_object('type','enum','nullable',true,'values','["socratic","reading+socratic","feynman","active-recall","deep-dive"]'::json),
        'reviewCount',  json_build_object('type','number'),
        'desiredScore', json_build_object('type','number','min',1,'max',5)
      )
    ),
    'touch', json_build_object(
      'queryFilters', '["sessionId","topicId","method","dateFrom","dateTo"]'::json,
      'sortFields',   '["createdAt","scoreAfter"]'::json,
      'createFields', '["sessionId","topicId","subjectId","method","scoreBefore","scoreAfter","effectiveness","agentComment"]'::json,
      'fields', json_build_object(
        'id',            json_build_object('type','uuid','readonly',true),
        'sessionId',     json_build_object('type','uuid','required',true),
        'topicId',       json_build_object('type','uuid','required',true),
        'method',        json_build_object('type','enum','required',true,'values','["socratic","reading+socratic","feynman","active-recall","deep-dive"]'::json),
        'scoreBefore',   json_build_object('type','number','required',true,'min',0,'max',5),
        'scoreAfter',    json_build_object('type','number','required',true,'min',0,'max',5),
        'effectiveness', json_build_object('type','enum','required',true,'values','["high","medium","low"]'::json),
        'agentComment',  json_build_object('type','string','required',true),
        'createdAt',     json_build_object('type','datetime','readonly',true)
      )
    ),
    'session', json_build_object(
      'sortFields',   '["startedAt","endedAt"]'::json,
      'createFields', '["subjectId"]'::json,
      'fields', json_build_object(
        'id',        json_build_object('type','uuid','readonly',true),
        'subjectId', json_build_object('type','uuid','required',true),
        'startedAt', json_build_object('type','datetime','readonly',true),
        'endedAt',   json_build_object('type','datetime','nullable',true)
      )
    )
  ),
  'operations', json_build_object(
    'get_dashboard',       json_build_object('params','[]'::json),
    'get_subject_context', json_build_object('params','["p_subject_id"]'::json),
    'get_topic',           json_build_object('params','["p_topic_id"]'::json),
    'create_session',      json_build_object('params','["p_subject_id"]'::json),
    'end_session',         json_build_object('params','["p_session_id"]'::json),
    'add_touch',           json_build_object('params','["p_session_id","p_topic_id","p_subject_id","p_method","p_score_before","p_score_after","p_effectiveness","p_agent_comment"]'::json),
    'update_topic',        json_build_object('params','["p_topic_id","p_patch"]'::json,'note','"p_patch fields: score,status,nextReview,lastReviewed,bestMethod,reviewCount,desiredScore,description"'),
    'update_methods',      json_build_object('params','["p_subject_id","p_method","p_score_delta"]'::json),
    'create_subject',      json_build_object('params','["p_name","p_goal","p_current_level","p_target_level"]'::json),
    'delete_subject',      json_build_object('params','["p_subject_id"]'::json),
    'update_subject',      json_build_object('params','["p_subject_id","p_patch"]'::json,'note','"p_patch fields: currentLevel"'),
    'add_topic',           json_build_object('params','["p_subject_id","p_name","p_level","p_prerequisites","p_resources","p_desired_score","p_description"]'::json),
    'query_topics',        json_build_object('params','["p_subject_id","p_filters","p_sort_field","p_sort_dir","p_limit"]'::json),
    'query_touches',       json_build_object('params','["p_subject_id","p_filters","p_sort_field","p_sort_dir","p_limit"]'::json),
    'query_sessions',      json_build_object('params','["p_subject_id","p_sort_field","p_sort_dir","p_limit"]'::json)
  )
);
$function$;
NOTIFY pgrst, 'reload schema';
