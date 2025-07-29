import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumber, IsString } from 'class-validator'

export class DeletePhotoDto {
  @ApiProperty({ description: 'ID фотографии' })
  @IsNumber()
  @IsNotEmpty()
  photoId!: number

  @ApiProperty({ description: 'Telegram ID психолога' })
  @IsString()
  @IsNotEmpty()
  telegramId!: string
} 