-- 008: Agregar categorías al colegio
ALTER TABLE colegios ADD COLUMN calendario varchar(5);
ALTER TABLE colegios ADD COLUMN tipo_colegio varchar(50);

-- Índices para filtrado rápido
CREATE INDEX idx_colegios_calendario ON colegios (calendario);
CREATE INDEX idx_colegios_tipo_colegio ON colegios (tipo_colegio);
