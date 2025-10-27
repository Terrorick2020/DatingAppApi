import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ComplaintStatus } from '../complaint.types'

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

	@ApiPropertyOptional({
		description:
			'Статус жалобы для фильтрации (если не указан, возвращаются все жалобы)',
		enum: ComplaintStatus,
		example: ComplaintStatus.UNDER_REVIEW,
	})
	@IsEnum(ComplaintStatus)
	@IsOptional()
	status?: ComplaintStatus
}
