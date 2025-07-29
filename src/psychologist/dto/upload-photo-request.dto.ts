import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class UploadPhotoRequestDto {
  @ApiProperty({ description: 'Telegram ID психолога' })
  @IsString()
  @IsNotEmpty()
  telegramId!: string
} 