-- 011: Add predefined "Correos" system category
INSERT INTO pi_categorias (nombre, orden, es_sistema)
VALUES ('Correos', 45, true)
ON CONFLICT (nombre) DO NOTHING;
