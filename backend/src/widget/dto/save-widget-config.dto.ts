import {
  IsString, IsOptional, IsBoolean, IsNumber, IsHexColor,
  IsUrl, IsIn, Min, Max, MinLength, MaxLength,
} from 'class-validator';

const POSICIONES = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
const FORMAS = ['circle', 'rounded'] as const;
const TAMANOS = ['sm', 'md', 'lg'] as const;
const ICONOS = ['chat', 'help', 'support'] as const;

export class SaveWidgetConfigDto {
  // ── Apariencia ──
  @IsOptional() @IsHexColor()
  color?: string;

  @IsOptional() @IsIn(POSICIONES)
  posicion?: string;

  @IsOptional() @IsIn(FORMAS)
  forma?: string;

  @IsOptional() @IsIn(TAMANOS)
  tamano?: string;

  @IsOptional() @IsIn(ICONOS)
  icono?: string;

  @IsOptional() @IsString() @MaxLength(60)
  textoBoton?: string;

  @IsOptional() @IsBoolean()
  mostrarTexto?: boolean;

  // ── Comportamiento ──
  @IsOptional() @IsBoolean()
  abrirAutomatico?: boolean;

  @IsOptional() @IsNumber() @Min(2) @Max(30)
  delayAutoAbrir?: number;

  @IsOptional() @IsString() @MaxLength(150)
  mensajeBurbuja?: string;

  @IsOptional() @IsBoolean()
  mostrarBurbuja?: boolean;

  @IsOptional() @IsUrl({ require_tld: false })
  chatUrl?: string;

  // ── Textos del panel ──
  @IsOptional() @IsString() @MaxLength(100)
  tituloPanelChat?: string;

  @IsOptional() @IsString() @MaxLength(150)
  subtituloPanelChat?: string;

  // ── Diseño del chat ──
  @IsOptional() @IsHexColor()
  chatHeaderColor?: string;

  @IsOptional() @IsHexColor()
  chatBgColor?: string;

  @IsOptional() @IsHexColor()
  chatBubbleColor?: string;

  @IsOptional() @IsHexColor()
  chatBubbleUserColor?: string;

  @IsOptional() @IsString() @MaxLength(80)
  chatMarca?: string;
}
