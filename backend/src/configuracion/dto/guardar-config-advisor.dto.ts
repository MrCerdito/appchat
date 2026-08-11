import { Type } from 'class-transformer';
import {
  IsInt,
  IsArray,
  Min,
  Max,
  IsString,
  ValidateNested,
  Validate,
} from 'class-validator';
import { HorarioAlmuerzo } from '../entities/configuracion.entity';
import { ValidTimeRangeConstraint } from './validators';

class HorarioAlmuerzoObject {
  @IsInt()
  @Min(0)
  @Max(6)
  dia: number;

  @IsString()
  @Validate(ValidTimeRangeConstraint)
  inicio: string;

  @IsString()
  @Validate(ValidTimeRangeConstraint)
  fin: string;
}

export class GuardarConfigAdvisorDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorarioAlmuerzoObject)
  almuerzos?: HorarioAlmuerzo[];
}
