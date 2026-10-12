-- Sort prerequisites across the whole queue before applying pagination.
ALTER TABLE public.collection_batches
  ADD COLUMN review_priority smallint GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^(teams|venues|meets)/")') THEN 0
      WHEN jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^athletes/")') THEN 1
      WHEN jsonb_path_exists(writes, '$[*] ? (@.path like_regex "^swims/")') THEN 2
      ELSE 3
    END
  ) STORED;

CREATE INDEX collection_batches_review_order_idx
  ON public.collection_batches (status, review_priority, received_at, id);
