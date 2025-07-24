import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdatePsychologistDto {
  @ApiProperty({ description: 'Имя психолога', minLength: 2, maxLength: 50, required: false })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  name?: string

  @ApiProperty({ description: 'Информация о психологе', minLength: 10, maxLength: 1000, required: false })
  @IsString()
  @IsOptional()
  @MinLength(10)
  @MaxLength(1000)
  about?: string
} 