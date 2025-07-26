import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class RegisterByInviteDto {
  @ApiProperty({ description: 'Код приглашения' })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiProperty({ description: 'Telegram ID психолога' })
  @IsString()
  @IsNotEmpty()
  telegramId!: string

  @ApiProperty({ description: 'Имя психолога' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiProperty({ description: 'Описание психолога' })
  @IsString()
  @IsNotEmpty()
  about!: string
} 