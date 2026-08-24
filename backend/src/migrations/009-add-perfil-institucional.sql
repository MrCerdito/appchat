-- Migración 009: Perfil Institucional (ficha 360° dinámica por colegio)
-- Ejecutar: docker exec -i chat-postgres psql -U postgres -d app < 009-add-perfil-institucional.sql

ALTER TABLE colegios ADD COLUMN IF NOT EXISTS logo_url text NULL;
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS pi_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(100) NOT NULL UNIQUE,
  orden int NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  es_sistema boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pi_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(150) NOT NULL,
  categoria_id uuid NOT NULL REFERENCES pi_categorias(id) ON DELETE CASCADE,
  tipo varchar(20) NOT NULL CHECK (tipo IN ('texto','texto_largo','numero','fecha','booleano','lista','email','telefono','url','archivo','moneda','porcentaje')),
  opciones jsonb NOT NULL DEFAULT '[]',
  requerido boolean NOT NULL DEFAULT false,
  mostrar_listado boolean NOT NULL DEFAULT false,
  mostrar_perfil boolean NOT NULL DEFAULT true,
  buscar boolean NOT NULL DEFAULT false,
  filtrable boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  es_sistema boolean NOT NULL DEFAULT false,
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pi_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id uuid NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
  campo_id uuid NOT NULL REFERENCES pi_campos(id) ON DELETE CASCADE,
  valor text NULL,
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pi_valores_colegio_campo UNIQUE (colegio_id, campo_id)
);

CREATE TABLE IF NOT EXISTS pi_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id uuid NULL REFERENCES colegios(id) ON DELETE CASCADE,
  campo_id uuid NULL REFERENCES pi_campos(id) ON DELETE SET NULL,
  usuario_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  accion varchar(50) NOT NULL,
  valor_anterior text NULL,
  valor_nuevo text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pi_campos_categoria ON pi_campos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_pi_valores_colegio ON pi_valores(colegio_id);
CREATE INDEX IF NOT EXISTS idx_pi_valores_campo ON pi_valores(campo_id);
CREATE INDEX IF NOT EXISTS idx_pi_historial_colegio ON pi_historial(colegio_id, created_at DESC);

INSERT INTO pi_categorias (nombre, orden, es_sistema) VALUES
  ('Académica', 10, true),
  ('Matrícula y admisiones', 20, true),
  ('Servicios', 30, true),
  ('Contactos', 40, true),
  ('Administrativo', 50, true),
  ('Tecnología', 60, true),
  ('Observaciones', 70, true)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO pi_campos (nombre, categoria_id, tipo, mostrar_perfil, filtrable, es_sistema, orden)
SELECT v.nombre, c.id, v.tipo, true, v.tipo = 'booleano', true, v.orden
FROM (VALUES
  ('Examen Único', 'booleano', 10, 'Académica'),
  ('Preescolar - Cualitativo', 'booleano', 20, 'Académica'),
  ('Tipo convivencia', 'texto', 30, 'Académica'),
  ('Reporte intermedio', 'booleano', 40, 'Académica'),
  ('CONFISIE', 'booleano', 50, 'Académica'),
  ('Bachillerato tipo', 'texto', 60, 'Académica'),
  ('Énfasis', 'texto', 70, 'Académica'),
  ('Legalización de matrículas', 'booleano', 10, 'Matrícula y admisiones'),
  ('Inscripción', 'booleano', 20, 'Matrícula y admisiones'),
  ('Admisión', 'booleano', 30, 'Matrícula y admisiones'),
  ('Tesorería', 'booleano', 10, 'Servicios'),
  ('Tienda', 'booleano', 20, 'Servicios'),
  ('Enfermería', 'booleano', 30, 'Servicios'),
  ('Psicorientación', 'booleano', 40, 'Servicios'),
  ('Mensajería', 'booleano', 50, 'Servicios'),
  ('Transporte', 'booleano', 60, 'Servicios'),
  ('Extracurricular', 'booleano', 70, 'Servicios'),
  ('Firma', 'booleano', 80, 'Servicios'),
  ('Observaciones', 'texto_largo', 10, 'Observaciones')
) AS v(nombre, tipo, orden, cat)
JOIN pi_categorias c ON c.nombre = v.cat
WHERE NOT EXISTS (SELECT 1 FROM pi_campos x WHERE x.nombre = v.nombre AND x.es_sistema = true);
