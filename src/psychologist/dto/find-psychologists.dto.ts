import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class FindPsychologistsDto {
  @ApiProperty({ description: 'Поиск по имени психолога', required: false })
  @IsString()
  @IsOptional()
  search?: string

  @ApiProperty({ description: 'Количество записей на странице', required: false, default: 10 })
  @IsOptional()
  limit?: number = 10

  @ApiProperty({ description: 'Смещение для пагинации', required: false, default: 0 })
  @IsOptional()
  offset?: number = 0
} 