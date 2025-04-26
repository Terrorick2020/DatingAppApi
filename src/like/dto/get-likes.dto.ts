import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsNotEmpty, IsString } from 'class-validator'

export class GetLikesDto {
	@ApiProperty({
		description: 'Telegram ID пользователя',
		example: '123456789',
	})
	@IsString()
	@IsNotEmpty()
	telegramId: string

	@ApiProperty({
		description: 'Тип запрашиваемых симпатий',
		enum: ['sent', 'received', 'matches'],
		example: 'sent',
	})
	@IsEnum(['sent', 'received', 'matches'], {
		message: 'Тип должен быть одним из: sent, received, matches',
	})
	@IsNotEmpty()
	type: 'sent' | 'received' | 'matches'
}
