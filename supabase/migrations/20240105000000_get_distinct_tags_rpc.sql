-- Server-side tag aggregation: unnest the tags array, group, count.
-- Returns each distinct tag with the number of contacts that have it.
CREATE OR REPLACE FUNCTION get_distinct_tags()
RETURNS TABLE(tag text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT unnest(tags) AS tag, COUNT(*) AS count
  FROM contacts
  WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
  GROUP BY tag
  ORDER BY tag;
$$;
