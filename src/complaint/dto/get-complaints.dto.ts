import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
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

	@ApiPropertyOptional({
		description: 'Смещение для пагинации',
		example: 0,
		default: 0,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	offset?: number = 0

	@ApiPropertyOptional({
		description: 'Количество записей на странице',
		example: 10,
		default: 10,
		required: false,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 10
}
