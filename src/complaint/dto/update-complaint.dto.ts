import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ComplaintStatus } from '../complaint.types'

export class UpdateComplaintDto {
	@ApiProperty({
		description: 'ID администратора, обновляющего жалобу',
		example: '123456789',
	})
	@IsString()
	adminId!: string

	@ApiProperty({
		description: 'ID жалобы',
		example: '1',
	})
	@IsString()
	complaintId!: string

	@ApiProperty({
		description: 'Новый статус жалобы',
		enum: ComplaintStatus,
		example: ComplaintStatus.UNDER_REVIEW,
	})
	@IsEnum(ComplaintStatus)
	status!: ComplaintStatus

	@ApiPropertyOptional({
		description: 'Примечания к резолюции',
		example: 'Пользователь получил предупреждение',
	})
	@IsString()
	@IsOptional()
	resolutionNotes?: string
}
