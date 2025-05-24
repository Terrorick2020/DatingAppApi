import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsNumber } from 'class-validator'
import { Transform } from 'class-transformer'

export class DeletePhotoDto {
	@ApiProperty({
		description: 'Telegram ID пользователя',
		example: '123456789',
	})
	@IsString()
	@IsNotEmpty()
	telegramId: string

	@ApiProperty({
		description: 'ID фотографии для удаления',
		example: 1,
	})
	@IsNumber()
	@Transform(({ value }) => parseInt(value, 10))
	photoId: number
}
