-- Migración 007: Agregar asesor principal a colegios
-- Cada colegio puede tener un asesor principal asignado.
-- Cuando un chat llega con ese colegio, se asigna primero a ese asesor.

ALTER TABLE colegios
ADD COLUMN advisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_colegios_advisor_id ON colegios(advisor_id);
