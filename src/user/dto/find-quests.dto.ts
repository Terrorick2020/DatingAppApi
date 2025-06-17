import { IsString, IsOptional, IsPositive, Min } from 'class-validator'
import { Type } from 'class-transformer'


export class FindQuestsQueryDto {
    @IsString()
    telegramId!: string

    @IsOptional()
    @Type(() => Number)
    @IsPositive()
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    @Min(0)
    offset?: number;
}
