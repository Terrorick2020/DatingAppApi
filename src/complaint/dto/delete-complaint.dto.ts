import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class DeleteComplaintDto {
	@ApiProperty({
		description: 'ID администратора, удаляющего жалобу',
		example: '123456789',
	})
	@IsString()
	adminId!: string

	@ApiProperty({
		description: 'ID жалобы для удаления',
		example: '1',
	})
	@IsString()
	complaintId!: string
}
