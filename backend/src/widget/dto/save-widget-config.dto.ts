import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsHexColor,
  IsIn,
  IsUrl,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

const POSICIONES = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;
const FORMAS = ['circle', 'rounded'] as const;
const TAMANOS = ['sm', 'md', 'lg'] as const;
const ICONOS = ['chat', 'help', 'support'] as const;

export class SaveWidgetConfigDto {
  // ── Apariencia ──
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsIn(POSICIONES)
  posicion?: string;

  @IsOptional()
  @IsIn(FORMAS)
  forma?: string;

  @IsOptional()
  @IsIn(TAMANOS)
  tamano?: string;

  @IsOptional()
  @IsIn(ICONOS)
  icono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  textoBoton?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  mostrarTexto?: boolean;

  // ── Comportamiento ──
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  abrirAutomatico?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2)
  @Max(30)
  delayAutoAbrir?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mensajeBurbuja?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  mostrarBurbuja?: boolean;

  @IsOptional()
  @IsString()
  @IsUrl()
  @MaxLength(255)
  chatUrl?: string;

  // ── Textos del panel ──
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tituloPanelChat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  subtituloPanelChat?: string;

  // ── Diseño del chat ──
  @IsOptional()
  @IsHexColor()
  chatHeaderColor?: string;

  @IsOptional()
  @IsHexColor()
  chatBgColor?: string;

  @IsOptional()
  @IsHexColor()
  chatBubbleColor?: string;

  @IsOptional()
  @IsHexColor()
  chatBubbleUserColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  chatMarca?: string;
}
