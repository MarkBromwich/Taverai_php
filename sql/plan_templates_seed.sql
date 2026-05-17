INSERT INTO plan_templates (id, slug, name, category, is_active)
VALUES
  ('pt_mediterranean', 'mediterranean', 'Mediterranean Diet', 'COMPOSITION', 1),
  ('pt_flexitarian', 'flexitarian', 'Flexitarian Diet', 'COMPOSITION', 1),
  ('pt_dash', 'dash', 'DASH Diet', 'MEDICAL', 1),
  ('pt_mind', 'mind', 'MIND Diet', 'MEDICAL', 1),
  ('pt_plant_forward', 'plant-forward', 'Plant-Forward / Plant-Based', 'COMPOSITION', 1),
  ('pt_pescatarian', 'pescatarian', 'Pescatarian', 'COMPOSITION', 1),
  ('pt_volumetrics', 'volumetrics', 'Volumetrics Diet', 'BEHAVIOR', 1),
  ('pt_intermittent_fasting', 'intermittent-fasting', 'Intermittent Fasting / Time-Restricted Eating', 'TIMING', 1),
  ('pt_low_gi', 'low-gi', 'Low-Glycemic Index (GI) Diet', 'MEDICAL', 1),
  ('pt_anti_inflammatory', 'anti-inflammatory', 'Anti-inflammatory Diet', 'MEDICAL', 1),
  ('pt_high_fiber', 'high-fiber', 'High-Fiber (Fibermaxxing)', 'BEHAVIOR', 1),
  ('pt_keto', 'keto', 'Ketogenic (Keto) / Low-Carb', 'MACRO', 1),
  ('pt_paleo', 'paleo', 'Paleo Diet', 'COMPOSITION', 1),
  ('pt_whole30', 'whole30', 'Whole30', 'ELIMINATION', 1),
  ('pt_vegetarian', 'vegetarian', 'Vegetarian', 'COMPOSITION', 1),
  ('pt_vegan', 'vegan', 'Vegan', 'COMPOSITION', 1),
  ('pt_high_protein', 'high-protein', 'High-Protein', 'MACRO', 1),
  ('pt_gluten_free', 'gluten-free', 'Gluten-Free', 'ELIMINATION', 1),
  ('pt_low_fodmap', 'low-fodmap', 'Low-FODMAP', 'MEDICAL', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  is_active = VALUES(is_active);
