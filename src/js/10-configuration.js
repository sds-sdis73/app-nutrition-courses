// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const APP_NAME = 'Tribu & Toutous';
// À incrémenter à chaque publication, avec la même valeur dans version.json.
const APP_VERSION = '2026-11-16.4';
const SUPABASE_URL = 'https://svugddkrptqpjmywhorb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2dWdkZGtycHRxcGpteXdob3JiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjU5NDgsImV4cCI6MjEwODUwMTk0OH0.63RETgf7rbVMquGV-7ooY3qn-Qf31uVCA3ZBfqBvFcI';
const OFF = 'https://world.openfoodfacts.org/api/v2';
const OFF_FIELDS = 'code,product_name,product_name_fr,brands,quantity,serving_quantity,serving_size,image_front_url,image_front_small_url,nutriscore_grade,nutriscore_score,nutriscore_data,nova_group,additives_tags,labels_tags,categories_tags,categories_hierarchy,compared_to_category,stores_tags,nutriments';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

