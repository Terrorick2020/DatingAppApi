import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class CreatePsychologistDto {
  @ApiProperty({ description: 'Telegram ID психолога' })
  @IsString()
  @IsNotEmpty()
  telegramId!: string

  @ApiProperty({ description: 'Имя психолога', minLength: 2, maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name!: string

  @ApiProperty({ description: 'Информация о психологе', minLength: 10, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  about!: string
} 