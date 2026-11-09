-- One-time editable menu backfill, not a rendering-time injection. Existing Cloud
-- branches (including hidden/nested ones), custom order and all other settings stay.
DO $$
DECLARE
  raw TEXT;
  saved JSONB;
  nav JSONB;
  upgraded JSONB;
  has_cloud BOOLEAN;
  invalid_node BOOLEAN;
  node_count INTEGER;
  insert_at INTEGER;
  cloud JSONB := '{"label":{"fa":"موبوکام کلاد","en":"MoboCom Cloud"},"href":"/cloud","icon":"cloud","menuDisplay":"mega","menuColumns":3,"description":{"fa":"میزبانی سایت، سرور و دامنه؛ انتخاب و مدیریت از یک حساب","en":"Hosting, servers and domains, managed from one account"},"children":[{"label":{"fa":"هاست سایت","en":"Web hosting"},"href":"/hosting","icon":"layers","description":{"fa":"پلن‌های میزبانی وب و کنترل‌پنل","en":"Web hosting plans and control panels"}},{"label":{"fa":"سرور مجازی و ابری","en":"Virtual and cloud servers"},"href":"/servers","icon":"server","description":{"fa":"بررسی سرورها، منابع و دوره‌های پرداخت","en":"Compare servers, resources and billing cycles"}},{"label":{"fa":"ثبت و انتقال دامنه","en":"Domain registration and transfer"},"href":"/domains","icon":"globe","description":{"fa":"جست‌وجو و سفارش دامنهٔ سایت","en":"Search and order your domain"}},{"label":{"fa":"پنل موبوکام کلاد","en":"Cloud dashboard"},"href":"/dashboard/cloud","icon":"cloud","description":{"fa":"سرویس‌ها، دامنه‌ها و تمدیدهای حساب شما","en":"Your services, domains and renewals"}},{"label":{"fa":"ساخت سرویس تازه","en":"Build a service"},"href":"/dashboard/cloud/new","icon":"plus","description":{"fa":"انتخاب سرویس و دیتاسنتر از داخل داشبورد","en":"Choose a service and datacenter in your dashboard"}},{"label":{"fa":"پشتیبانی سرویس‌ها","en":"Service support"},"href":"/dashboard/tickets","icon":"lifebuoy","description":{"fa":"ثبت درخواست و پیگیری پاسخ پشتیبانی","en":"Open a ticket and follow up"}}]}'::JSONB;
BEGIN
  SELECT "value" INTO raw FROM "Setting" WHERE "key" = 'site.config.v1' FOR UPDATE;
  IF raw IS NULL THEN RETURN; END IF;
  BEGIN saved := raw::JSONB;
  EXCEPTION WHEN invalid_text_representation THEN RETURN;
  END;
  IF saved->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(saved->'navigation') IS DISTINCT FROM 'array' THEN RETURN; END IF;
  nav := saved->'navigation';
  WITH RECURSIVE tree(node, depth) AS (
    SELECT value, 1 FROM jsonb_array_elements(nav)
    UNION ALL
    SELECT child.value, tree.depth + 1 FROM tree
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(tree.node->'children') = 'array' THEN tree.node->'children' ELSE '[]'::JSONB END) child
      WHERE tree.depth < 5
  ), bounded AS (SELECT node FROM tree LIMIT 121)
  SELECT count(*), bool_or(regexp_replace(split_part(split_part(node->>'href', '?', 1), '#', 1), '/+$', '') = '/cloud'),
    bool_or(jsonb_typeof(node) IS DISTINCT FROM 'object' OR jsonb_typeof(node->'href') IS DISTINCT FROM 'string' OR jsonb_typeof(node->'label') IS DISTINCT FROM 'object')
  INTO node_count, has_cloud, invalid_node FROM bounded;
  IF has_cloud OR invalid_node OR node_count + 7 > 120 THEN RETURN; END IF;
  SELECT ord::INTEGER INTO insert_at FROM jsonb_array_elements(nav) WITH ORDINALITY AS entry(node, ord)
    WHERE node->>'href' = '/products' ORDER BY ord LIMIT 1;
  IF insert_at IS NULL THEN
    SELECT ord::INTEGER INTO insert_at FROM jsonb_array_elements(nav) WITH ORDINALITY AS entry(node, ord)
      WHERE node->>'href' = '/' ORDER BY ord LIMIT 1;
  END IF;
  insert_at := COALESCE(insert_at, jsonb_array_length(nav));
  SELECT COALESCE(jsonb_agg(node ORDER BY position), '[]'::JSONB) INTO upgraded FROM (
    SELECT node, ord * 2 AS position FROM jsonb_array_elements(nav) WITH ORDINALITY AS entry(node, ord)
    UNION ALL SELECT cloud, insert_at * 2 + 1
  ) entries;
  UPDATE "Setting" SET "value" = jsonb_set(saved, '{navigation}', upgraded)::TEXT WHERE "key" = 'site.config.v1';
END $$;
