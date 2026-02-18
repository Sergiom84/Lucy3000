SELECT 'users' AS table_name, COUNT(*) AS total FROM public.users
UNION ALL
SELECT 'clients' AS table_name, COUNT(*) AS total FROM public.clients
UNION ALL
SELECT 'services' AS table_name, COUNT(*) AS total FROM public.services
UNION ALL
SELECT 'appointments' AS table_name, COUNT(*) AS total FROM public.appointments
UNION ALL
SELECT 'products' AS table_name, COUNT(*) AS total FROM public.products
UNION ALL
SELECT 'stock_movements' AS table_name, COUNT(*) AS total FROM public.stock_movements
UNION ALL
SELECT 'sales' AS table_name, COUNT(*) AS total FROM public.sales
UNION ALL
SELECT 'sale_items' AS table_name, COUNT(*) AS total FROM public.sale_items
UNION ALL
SELECT 'cash_registers' AS table_name, COUNT(*) AS total FROM public.cash_registers
UNION ALL
SELECT 'cash_movements' AS table_name, COUNT(*) AS total FROM public.cash_movements
UNION ALL
SELECT 'notifications' AS table_name, COUNT(*) AS total FROM public.notifications
UNION ALL
SELECT 'settings' AS table_name, COUNT(*) AS total FROM public.settings
UNION ALL
SELECT 'client_history' AS table_name, COUNT(*) AS total FROM public.client_history
ORDER BY table_name;

