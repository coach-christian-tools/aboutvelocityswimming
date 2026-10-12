-- Match rebuild_bests' eligibility and winner order so every import approval
-- avoids filtering and sorting the full JSON swim payload on disk.
CREATE INDEX swims_best_candidates_idx
ON public.swims (athlete_id, event_code, time_ms, (data #>> '{meet,date}'), id)
WHERE status='OK'
  AND coalesce(data->>'isOfficial','true')='true'
  AND (coalesce(data->>'isRelay','false')='false'
    OR data #>> '{relay,isLeadOffFlatStart}'='true');
