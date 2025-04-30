import { IsString, IsEnum, IsOptional } from 'class-validator'

export enum ComplaintStatus {
	PENDING = 'PENDING',
	UNDER_REVIEW = 'UNDER_REVIEW',
	RESOLVED = 'RESOLVED',
	REJECTED = 'REJECTED',
}

export class UpdateComplaintDto {
	@IsString()
	roomName: string

	@IsString()
	telegramId: string

	@IsString()
	complaintId: string

	@IsEnum(ComplaintStatus)
	status: ComplaintStatus

	@IsString()
	@IsOptional()
	resolutionNotes?: string
}
