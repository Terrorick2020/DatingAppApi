import { IsString, IsEnum } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class GetComplaintsDto {
	@ApiProperty({
		description: 'ID пользователя',
		example: '123456789',
	})
	@IsString()
	telegramId!: string

	@ApiProperty({
		description: 'Тип запрашиваемых жалоб',
		enum: ['sent', 'received', 'admin'],
		example: 'sent',
	})
	@IsEnum(['sent', 'received', 'admin'], {
		message: 'Тип должен быть одним из: sent, received, admin',
	})
	type!: 'sent' | 'received' | 'admin'
}
