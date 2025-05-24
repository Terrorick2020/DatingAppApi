import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class DeleteUserDto {
	@ApiProperty({
		description: 'Telegram ID пользователя для удаления',
		example: '123456789',
	})
	@IsString()
	@IsNotEmpty()
	telegramId: string

	@ApiProperty({
		description: 'Причина удаления (опционально)',
		example: 'Удаление по запросу пользователя',
		required: false,
	})
	@IsString()
	reason?: string
}
