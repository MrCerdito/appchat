-- Oculta el widget en móvil (≤520px) cuando está activado el toggle
-- "Ocultar en móvil" de la configuración del widget.

ALTER TABLE widget_config
  ADD COLUMN IF NOT EXISTS ocultar_en_movil boolean NOT NULL DEFAULT false;