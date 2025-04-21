import { ValidateIf, IsString, IsOptional } from 'class-validator'
import { FindDto } from './find.dto'

export class UpdateDto extends FindDto {
    @ValidateIf((o) => o.isChecked === undefined)
    @IsString()
    @IsOptional()
    msg?: string

    @ValidateIf((o) => o.msg === undefined)
    @IsString()
    @IsOptional()
    isChecked?:  boolean
}
